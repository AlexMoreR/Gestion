import type { SaleStatus } from "@prisma/client";

import { saleStatusForPaid } from "../../ventas/domain/sale-paid-status";

// Revisor diario (solo lectura): reglas puras que buscan datos que no cuadran. Cada hallazgo
// dice qué es (tipo), dónde (código), el detalle y si toca plata (esPlata). El script de aizen1
// compara tipo + código con el día anterior para decidir a quién avisar.

export type Hallazgo = { tipo: string; codigo: string; detalle: string; esPlata: boolean };

const pesos = (valor: number) => `$${Math.round(valor).toLocaleString("es-CO")}`;
// Tolerancia de redondeo en plata (centavos de los Decimal).
const casiIgual = (a: number, b: number) => Math.abs(a - b) < 1;

// 1) Venta "Pagada" con saldo, o pagada por completo sin marcar como pagada.
export type VentaRevisada = { codigo: string; estado: SaleStatus; total: number; pagado: number };

export function revisarVentas(ventas: VentaRevisada[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const venta of ventas) {
    const esperado = saleStatusForPaid(venta.pagado, venta.total, venta.estado);
    if (esperado === venta.estado) continue;
    const saldo = venta.total - venta.pagado;
    hallazgos.push(
      venta.estado === "INVOICED"
        ? {
            tipo: "VENTA_PAGADA_CON_SALDO",
            codigo: venta.codigo,
            detalle: `Marcada como pagada pero le faltan ${pesos(saldo)} (total ${pesos(venta.total)}, abonos ${pesos(venta.pagado)})`,
            esPlata: true,
          }
        : {
            tipo: "VENTA_PAGADA_SIN_MARCAR",
            codigo: venta.codigo,
            detalle: `Los abonos (${pesos(venta.pagado)}) cubren el total (${pesos(venta.total)}) y no está marcada como pagada`,
            esPlata: true,
          },
    );
  }
  return hallazgos;
}

// 2) Pago o cargo a proveedora que se quedó sin su orden (la orden se borró y el movimiento quedó suelto).
export type MovimientoProveedora = {
  id: string;
  codigo: string | null;
  tipo: "CHARGE" | "PAYMENT";
  monto: number;
  nota: string | null;
  proveedora: string;
  orderId: string | null;
  orderItemId: string | null;
  inventoryMovementId: string | null;
  dispatchId: string | null;
  settlesEntryId: string | null;
};

const CODIGO_ORDEN = /\bORD-\d+/;

export function revisarProveedoras(movimientos: MovimientoProveedora[]): Hallazgo[] {
  return movimientos
    .filter(
      (m) =>
        m.orderId === null &&
        m.inventoryMovementId === null &&
        m.dispatchId === null &&
        m.settlesEntryId === null &&
        // Iba a una orden (ítem o nota con su código) y la orden ya no está.
        (m.orderItemId !== null || CODIGO_ORDEN.test(m.nota ?? "")),
    )
    .map((m) => ({
      tipo: m.tipo === "PAYMENT" ? "PAGO_PROVEEDORA_SIN_ORDEN" : "CARGO_PROVEEDORA_SIN_ORDEN",
      codigo: m.codigo ?? m.id,
      detalle: `${m.tipo === "PAYMENT" ? "Pago" : "Cargo"} de ${pesos(m.monto)} a ${m.proveedora} sin su orden${m.nota ? ` (${m.nota})` : ""}`,
      esPlata: true,
    }));
}

// 3a) Productos con stock negativo.
export type StockProducto = { codigo: string; nombre: string; stock: number };

export function revisarStockNegativo(productos: StockProducto[]): Hallazgo[] {
  return productos
    .filter((p) => p.stock < 0)
    .map((p) => ({
      tipo: "STOCK_NEGATIVO",
      codigo: p.codigo,
      detalle: `${p.nombre} tiene stock ${p.stock}`,
      esPlata: false,
    }));
}

// 3b) Ítems "por stock" de una orden de venta, confirmados o ya entregados, sin su salida de
// inventario ("Salida por orden ORD-..."). Las órdenes canceladas devuelven el stock: no cuentan.
export type ItemStockVenta = {
  orden: string;
  estadoOrden: string;
  productId: string;
  producto: string;
  cantidad: number;
  confirmado: boolean;
};
/** Unidades que salieron por orden y producto, clave `${orden}|${productId}`. */
export type SalidasPorOrden = Map<string, number>;

const ESTADOS_ENTREGADOS = new Set(["DISPATCHED", "COMPLETED"]);

export function revisarSalidasStock(items: ItemStockVenta[], salidas: SalidasPorOrden): Hallazgo[] {
  const necesita = new Map<string, { orden: string; producto: string; cantidad: number }>();
  for (const item of items) {
    if (item.estadoOrden === "CANCELLED") continue;
    if (!item.confirmado && !ESTADOS_ENTREGADOS.has(item.estadoOrden)) continue;
    const clave = `${item.orden}|${item.productId}`;
    const actual = necesita.get(clave) ?? { orden: item.orden, producto: item.producto, cantidad: 0 };
    actual.cantidad += item.cantidad;
    necesita.set(clave, actual);
  }
  const hallazgos: Hallazgo[] = [];
  for (const [clave, { orden, producto, cantidad }] of necesita) {
    const salio = salidas.get(clave) ?? 0;
    if (salio >= cantidad) continue;
    hallazgos.push({
      tipo: "STOCK_SIN_SALIDA",
      codigo: orden,
      detalle: `${producto}: ${cantidad} confirmada(s) o entregada(s) y solo salieron ${salio} del inventario`,
      esPlata: false,
    });
  }
  return hallazgos;
}

// 3c y 4) Compras directas: su entrada al inventario debe coincidir con lo comprado, y una
// compra ya recibida debe quedar "Completada".
export type CompraRevisada = {
  orden: string;
  codigoCompra: string;
  estado: string;
  /** Todos sus productos llegaron (despachos entregados). */
  recibida: boolean;
  items: { productId: string; producto: string; cantidad: number }[];
  /** Unidades netas que entraron al inventario con el código de la compra, por productId. */
  entradas: Map<string, number>;
  /**
   * Unidades de la compra por lote (CompraUnidad PENDIENTE o FABRICANDO) que aún no deben estar en
   * el inventario, por productId de las líneas (un combo ya viene repartido en sus piezas).
   */
  pendientes?: Map<string, number>;
};

export function revisarCompras(compras: CompraRevisada[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const compra of compras) {
    if (compra.estado === "CANCELLED") continue;
    const codigo = compra.codigoCompra;
    // Lo esperado por producto: lo comprado menos lo que sigue pendiente o fabricándose.
    const comprado = new Map<string, { producto: string; cantidad: number }>();
    for (const item of compra.items) {
      const actual = comprado.get(item.productId) ?? { producto: item.producto, cantidad: 0 };
      actual.cantidad += item.cantidad;
      comprado.set(item.productId, actual);
    }
    for (const [productId, pendientes] of compra.pendientes ?? []) {
      const actual = comprado.get(productId);
      if (actual) actual.cantidad -= pendientes;
    }
    const todoPendiente = (compra.pendientes?.size ?? 0) > 0 && [...comprado.values()].every((c) => c.cantidad <= 0);
    if (compra.entradas.size === 0 && compra.items.length > 0) {
      if (!todoPendiente) {
        hallazgos.push({
          tipo: "COMPRA_SIN_ENTRADA",
          codigo,
          detalle: `La compra (${compra.orden}) no tiene entrada al inventario`,
          esPlata: false,
        });
      }
    } else {
      const productos = new Set([...comprado.keys(), ...compra.entradas.keys()]);
      for (const productId of productos) {
        const cantidad = comprado.get(productId)?.cantidad ?? 0;
        const entro = compra.entradas.get(productId) ?? 0;
        if (cantidad === entro) continue;
        hallazgos.push({
          tipo: "COMPRA_CANTIDAD_DISTINTA",
          codigo,
          detalle: `${comprado.get(productId)?.producto ?? "Un producto"}: se ${compra.pendientes?.get(productId) ? "esperaban" : "compraron"} ${cantidad} y entraron ${entro} al inventario`,
          esPlata: false,
        });
      }
    }
    if (compra.recibida && compra.estado !== "COMPLETED") {
      hallazgos.push({
        tipo: "COMPRA_RECIBIDA_SIN_COMPLETAR",
        codigo,
        detalle: `La compra (${compra.orden}) ya se recibió y no está "Completada"`,
        esPlata: false,
      });
    }
  }
  return hallazgos;
}

// 5a) Borrado de una venta, orden o pago en la bitácora sin su copia en RegistroAnulado.
export type BorradoBitacora = {
  entityType: string;
  entityId: string | null;
  entityCode: string | null;
  resumen: string;
  /** El registro todavía existe (p. ej. "Deshizo la fabricación": la orden sigue). */
  existe: boolean;
  /** Tiene fila en RegistroAnulado. */
  anulado: boolean;
};

export function revisarBorrados(borrados: BorradoBitacora[]): Hallazgo[] {
  return borrados
    .filter((b) => b.entityId !== null && !b.existe && !b.anulado)
    .map((b) => ({
      tipo: "BORRADO_SIN_ANULACION",
      codigo: b.entityCode ?? b.entityId!,
      detalle: `Se borró sin dejar copia en anulados: ${b.resumen}`,
      esPlata: true,
    }));
}

// 5b) Huecos en la numeración (ORD, SAL, COM). Un número anulado con motivo no es hueco.
export function revisarNumeracion(prefijo: string, codigos: string[], anulados: Set<string>): Hallazgo[] {
  const patron = new RegExp(`^${prefijo}-(\\d+)$`);
  const numeros = new Set<number>();
  let ancho = 5;
  for (const codigo of codigos) {
    const match = patron.exec(codigo.trim());
    if (!match) continue;
    numeros.add(Number(match[1]));
    ancho = match[1].length;
  }
  const numerosAnulados = new Set<number>();
  for (const codigo of anulados) {
    const match = patron.exec(codigo.trim());
    if (match) numerosAnulados.add(Number(match[1]));
  }
  if (numeros.size === 0) return [];
  const maximo = Math.max(...numeros);
  const minimo = Math.min(...numeros);
  const hallazgos: Hallazgo[] = [];
  for (let n = minimo + 1; n < maximo; n += 1) {
    if (numeros.has(n) || numerosAnulados.has(n)) continue;
    hallazgos.push({
      tipo: "HUECO_NUMERACION",
      codigo: `${prefijo}-${String(n).padStart(ancho, "0")}`,
      detalle: `Falta el ${prefijo}-${n}: no existe y no aparece como anulado`,
      esPlata: false,
    });
  }
  return hallazgos;
}

// 6a) Cuentas en negativo (saldo de "Dinero hoy").
export function revisarCuentasNegativas(cuentas: { nombre: string; saldo: number }[]): Hallazgo[] {
  return cuentas
    .filter((c) => c.saldo < 0)
    .map((c) => ({
      tipo: "CUENTA_NEGATIVA",
      codigo: c.nombre,
      detalle: `La cuenta está en ${pesos(c.saldo)}`,
      esPlata: true,
    }));
}

// 6b) Saltos: el saldo al cierre de ayer menos el que reportó la corrida anterior debe ser
// igual a los movimientos de ayer. Si no, algo de días anteriores cambió (editado, borrado o
// registrado con fecha vieja). Sin dato de la corrida anterior no se compara.
export type SaldoDelDia = { id: string; nombre: string; saldoCierre: number; movimientosDelDia: number };

export function revisarSaltosDeSaldo(cuentas: SaldoDelDia[], saldosAnteriores: Record<string, number> | null): Hallazgo[] {
  if (!saldosAnteriores) return [];
  const hallazgos: Hallazgo[] = [];
  for (const cuenta of cuentas) {
    const anterior = saldosAnteriores[cuenta.id];
    if (typeof anterior !== "number" || !Number.isFinite(anterior)) continue;
    const esperado = anterior + cuenta.movimientosDelDia;
    if (casiIgual(esperado, cuenta.saldoCierre)) continue;
    hallazgos.push({
      tipo: "SALDO_SIN_EXPLICAR",
      codigo: cuenta.nombre,
      detalle: `Cambió ${pesos(cuenta.saldoCierre - esperado)} sin movimientos que lo expliquen (antes ${pesos(anterior)}, movimientos del día ${pesos(cuenta.movimientosDelDia)}, ahora ${pesos(cuenta.saldoCierre)})`,
      esPlata: true,
    });
  }
  return hallazgos;
}
