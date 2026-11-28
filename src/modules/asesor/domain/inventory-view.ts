import { colombiaDayKey, colombiaTimeOfDay } from "../../../lib/colombia-time";
import { stripCodeZeros } from "../../../lib/code-display";
import { matchesText } from "./payments";

// Vista de SOLO LECTURA del inventario para el asesor: stock por producto, de donde salio
// cada movimiento y donde estan las unidades de compra por lote. Nunca inventa un origen.

export type InventoryMovementType = "IN" | "OUT" | "ADJUSTMENT";

export type InventoryProductRow = {
  id: string;
  code: string | null;
  name: string;
  // Costo de la proxima unidad que sale (FIFO), ya calculado por el repositorio.
  costoUnitario: number;
  costoFuente: string;
};

export type InventoryMovementRow = {
  productId: string;
  type: InventoryMovementType;
  change: number;
  note: string | null;
  purchaseCode: string | null;
  sourceOrderItemId: string | null;
  // Codigo de la orden de la venta anulada (sourceOrderItemId), ya resuelto; null si no se encontro.
  ordenAnulada?: string | null;
  movementDate: Date;
  persona: string | null;
};

export type InventoryLotUnitRow = {
  productId: string;
  estado: string;
  ubicacion: string | null;
};

export type OrigenMovimiento = { tipo: string; referencia: string | null };

export const MAX_MOVIMIENTOS_POR_PRODUCTO = 100;

const CODIGO_EN_NOTA = /\b(ORD|SAL|OF|COT)-?\s?(\d+)\b/i;
const DEVOLUCION = /devoluci[oó]n|devuelt[oa]/i;
const ETIQUETA_CODIGO: Record<string, string> = {
  ORD: "orden",
  SAL: "venta",
  OF: "orden de fabricación",
  COT: "cotización",
};

export function origenDeMovimiento(
  mov: Pick<InventoryMovementRow, "type" | "change" | "note" | "purchaseCode" | "sourceOrderItemId" | "ordenAnulada">,
): OrigenMovimiento {
  if (mov.sourceOrderItemId) {
    return { tipo: "venta anulada", referencia: mov.ordenAnulada ? stripCodeZeros(mov.ordenAnulada) : null };
  }
  if (mov.purchaseCode) return { tipo: "compra", referencia: stripCodeZeros(mov.purchaseCode) };
  const note = mov.note ?? "";
  const codigo = CODIGO_EN_NOTA.exec(note);
  const referencia = codigo ? stripCodeZeros(`${codigo[1].toUpperCase()}-${codigo[2]}`) : null;
  if (DEVOLUCION.test(note)) return { tipo: "devolución", referencia };
  if (codigo) return { tipo: ETIQUETA_CODIGO[codigo[1].toUpperCase()], referencia };
  if (mov.type === "ADJUSTMENT") return { tipo: "ajuste manual", referencia: null };
  return { tipo: "sin dato", referencia: null };
}

export function coincideBusqueda(producto: { code: string | null; name: string }, busqueda: string | undefined): boolean {
  return matchesText(producto.code, busqueda) || matchesText(producto.name, busqueda);
}

const TIPO_MOVIMIENTO: Record<InventoryMovementType, string> = { IN: "entrada", OUT: "salida", ADJUSTMENT: "ajuste" };
const UBICACIONES = ["CALI", "TALLER_PROVEEDORA"] as const;
const ESTADOS = ["PENDIENTE", "FABRICANDO", "EN_INVENTARIO", "VENDIDA"] as const;

function contarLote(unidades: InventoryLotUnitRow[], stock: number) {
  const por_estado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<string, number>;
  const por_ubicacion = { CALI: 0, TALLER_PROVEEDORA: 0, sin_dato: 0 } as Record<string, number>;
  for (const unidad of unidades) {
    por_estado[unidad.estado] = (por_estado[unidad.estado] ?? 0) + 1;
    // Lo vendido ya no esta en ninguna ubicacion nuestra.
    if (unidad.estado === "VENDIDA") continue;
    const lugar = (UBICACIONES as readonly string[]).includes(unidad.ubicacion ?? "") ? unidad.ubicacion! : "sin_dato";
    por_ubicacion[lugar] += 1;
  }
  return {
    unidades_de_lote: unidades.length,
    por_ubicacion,
    por_estado,
    // Stock que no esta explicado por unidades de lote en inventario (Bogota no se registra).
    sin_ubicacion_registrada: Math.max(0, stock - por_estado.EN_INVENTARIO),
  };
}

export function resumirInventario(
  productos: InventoryProductRow[],
  movimientos: InventoryMovementRow[],
  unidadesLote: InventoryLotUnitRow[],
  opciones: { conMovimientos: boolean },
) {
  return productos.map((producto) => {
    const propios = movimientos
      .filter((m) => m.productId === producto.id)
      .sort((a, b) => b.movementDate.getTime() - a.movementDate.getTime());
    const stock = propios.reduce((sum, m) => sum + m.change, 0);
    const base = {
      codigo: producto.code,
      nombre: producto.name,
      stock,
      stock_negativo: stock < 0 ? `Stock negativo (${stock}): salió más de lo que entró.` : null,
      costo_unitario: producto.costoUnitario,
      costo_fuente: producto.costoFuente,
      ubicacion: contarLote(unidadesLote.filter((u) => u.productId === producto.id), stock),
    };
    if (!opciones.conMovimientos) return base;
    return {
      ...base,
      movimientos: propios.slice(0, MAX_MOVIMIENTOS_POR_PRODUCTO).map((m) => {
        const origen = origenDeMovimiento(m);
        return {
          fecha: `${colombiaDayKey(m.movementDate)} ${colombiaTimeOfDay(m.movementDate)}`,
          persona: m.persona ?? "sin dato",
          tipo: TIPO_MOVIMIENTO[m.type],
          cantidad: m.change,
          origen: origen.tipo,
          referencia: origen.referencia,
          nota: m.note,
        };
      }),
      movimientos_cortado: propios.length > MAX_MOVIMIENTOS_POR_PRODUCTO,
    };
  });
}
