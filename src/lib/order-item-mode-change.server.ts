// Cambiar Fabricación ↔ Stock un producto ya confirmado (T-846). Reglas puras en order-item-mode-change.ts.
//  A_STOCK: anula el cargo a la proveedora (copia en Anulados) y su producción, saca las piezas del inventario
//           y les pone el costo de la compra elegida.
//  A_FABRICACION: devuelve las piezas al inventario, les pone la proveedora y el costo escritos y crea el
//           cargo (la deuda) y la producción; la OF sale sola en la orden.
// Un combo cambia completo (todas sus piezas en ese modo). No toca la venta, los abonos, la entrega, el
// despacho ni los fletes. planCambioModo calcula el antes/después (vista previa) y lo mismo que se escribe.
import "server-only";
import type { Prisma } from "@prisma/client";
import { anularVarias, bloqueoPorAbonos } from "@/lib/anulaciones";
import { linesToRecolor } from "@/lib/color-change";
import { computeItemUnitCost } from "@/lib/order-item-cost";
import { buildProductionJobCode, parseProductionJobCodeNumber } from "@/lib/orders";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { AVISO_PRODUCTO_CANCELADO } from "@/lib/sale-item-cancel";
import { displayCode } from "@/lib/code-display";
import { marcarPagadaAlRecoger } from "@/lib/order-dispatch";
import { SOLO_FOTOS } from "@/lib/product-fichas";
import {
  bloqueoCambioModo,
  bloqueoPorPagosEnLaOrden,
  costoTotal,
  direccionDeCambio,
  faltaStock,
  gananciaVenta,
  naceRecogida,
  type DireccionCambio,
} from "@/lib/order-item-mode-change";

type Db = Prisma.TransactionClient;

export type PiezaVista = {
  id: string;
  nombre: string;
  cantidad: number;
  stockAntes: number;
  stockDespues: number;
  costoAntes: number;
  costoDespues: number;
};

export type VistaCambio = {
  direccion: DireccionCambio;
  producto: string;
  orden: string;
  /** De dónde sale el costo nuevo: "ORD-99 (COM-11)" o la proveedora. */
  origen: string;
  piezas: PiezaVista[];
  proveedoras: { nombre: string; deudaAntes: number; deudaDespues: number }[];
  costoVentaAntes: number;
  costoVentaDespues: number;
  gananciaAntes: number;
  gananciaDespues: number;
};

export type OpcionesCambio = {
  direccion: DireccionCambio;
  producto: string;
  piezas: { id: string; nombre: string; cantidad: number; costoActual: number }[];
  /** A_STOCK: compras con todas las piezas (costo por unidad de cada una). */
  compras: { id: string; etiqueta: string; costos: Record<string, number> }[];
  /** A_FABRICACION: proveedoras fábrica; costos sugeridos por pieza (de su ficha). */
  proveedoras: { id: string; nombre: string; costos: Record<string, number | null> }[];
  proveedoraSugerida: string | null;
};

export type EntradaCambio = {
  orderItemId: string;
  compraId?: string | null;
  supplierId?: string | null;
  /** A_FABRICACION: costo por unidad de cada pieza (id → pesos). */
  costos?: Record<string, number>;
};

const nombreProveedora = (s: { name: string; displayName: string | null }) => s.displayName || s.name;

async function cargar(db: Db, orderItemId: string) {
  const item = await db.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } });
  if (!item) return { error: "Producto no encontrado." } as const;
  const order = await db.order.findUnique({
    where: { id: item.orderId },
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      saleId: true,
      sale: {
        select: {
          id: true,
          code: true,
          status: true,
          total: true,
          quoteId: true,
          shippingCosts: { select: { amount: true } },
        },
      },
      items: {
        include: {
          product: {
            select: {
              name: true,
              baseCost: true,
              additionalCost: true,
              suppliers: { select: { supplierId: true, supplierCost: true, isPreferred: true } },
            },
          },
          productionJobs: true,
        },
      },
      manufacturingOrders: { select: { id: true, supplierId: true, receivedAt: true } },
    },
  });
  if (!order) return { error: "Orden no encontrada." } as const;
  const clicked = order.items.find((o) => o.id === orderItemId);
  const direccion = clicked ? direccionDeCambio(clicked) : null;
  const quoteItems = order.sale
    ? await db.quoteItem.findMany({
        where: { quoteId: order.sale.quoteId },
        select: { id: true, notes: true, product: { select: { name: true, isBundle: true } } },
      })
    : [];
  const grupo = linesToRecolor(
    orderItemId,
    quoteItems.map((q) => ({ id: q.id, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle })),
    order.items,
  );
  const piezas = direccion
    ? order.items.filter((o) => grupo?.orderItemIds.includes(o.id) && direccionDeCambio(o) === direccion)
    : [];
  const bloqueo = bloqueoCambioModo({
    esVenta: order.type === "SALE",
    ordenEstado: order.status,
    ventaEstado: order.sale?.status ?? null,
    piezas: piezas.length,
  });
  if (bloqueo || !direccion || !clicked) return { error: bloqueo ?? "Producto no encontrado." } as const;
  const meta = parseQuoteItemMeta(clicked.notes);
  const producto = piezas.length > 1 && meta.comboName ? meta.comboName : clicked.product.name;
  return { order, piezas, direccion, producto, meta } as const;
}

type Cargado = Exclude<Awaited<ReturnType<typeof cargar>>, { error: string }>;

const costoActual = (o: Cargado["order"]["items"][number]) =>
  computeItemUnitCost({
    purchaseCost: o.purchaseCost === null ? null : Number(o.purchaseCost),
    fulfillmentMode: o.fulfillmentMode,
    baseCost: Number(o.product.baseCost),
    additionalCost: Number(o.product.additionalCost ?? 0),
    preferredSupplierCost: (() => {
      const pref = o.product.suppliers.find((s) => s.isPreferred) ?? o.product.suppliers[0];
      return pref?.supplierCost == null ? null : Number(pref.supplierCost);
    })(),
  });

async function comprasConPiezas(db: Db, piezas: Cargado["piezas"]) {
  const productIds = [...new Set(piezas.map((p) => p.productId))];
  const compras = await db.order.findMany({
    where: { type: "PURCHASE", status: { not: "CANCELLED" }, items: { some: { productId: { in: productIds } } } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      code: true,
      purchaseCode: true,
      createdAt: true,
      items: { select: { productId: true, purchaseCost: true, confirmedSupplier: { select: { name: true, displayName: true } } } },
    },
  });
  return compras
    .map((compra) => {
      const costos: Record<string, number> = {};
      for (const pieza of piezas) {
        const linea = compra.items.find((l) => l.productId === pieza.productId && l.purchaseCost !== null);
        if (linea) costos[pieza.id] = Number(linea.purchaseCost);
      }
      const proveedora = compra.items.find((l) => l.confirmedSupplier)?.confirmedSupplier;
      const fecha = compra.createdAt.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });
      const etiqueta = `${displayCode(compra.code)}${compra.purchaseCode ? ` (${displayCode(compra.purchaseCode)})` : ""} · ${fecha}${
        proveedora ? ` · ${nombreProveedora(proveedora)}` : ""
      }`;
      return { id: compra.id, code: compra.code, etiqueta, costos };
    })
    .filter((c) => piezas.every((p) => c.costos[p.id] !== undefined))
    .slice(0, 12);
}

export async function opcionesCambioModo(db: Db, orderItemId: string): Promise<OpcionesCambio | { error: string }> {
  const base = await cargar(db, orderItemId);
  if ("error" in base) return { error: base.error as string };
  const { piezas, direccion, producto } = base;
  const compras = direccion === "A_STOCK" ? await comprasConPiezas(db, piezas) : [];
  if (direccion === "A_STOCK" && compras.length === 0) {
    return { error: "No hay ninguna compra de inventario con estas piezas: regístrala primero en Inventario." };
  }
  const fabricas =
    direccion === "A_FABRICACION"
      ? await db.supplier.findMany({
          where: { type: "MANUFACTURER", isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, displayName: true },
        })
      : [];
  const proveedoras = fabricas.map((s) => ({
    id: s.id,
    nombre: nombreProveedora(s),
    costos: Object.fromEntries(
      piezas.map((p) => {
        const ficha = p.product.suppliers.find((x) => x.supplierId === s.id)?.supplierCost;
        return [p.id, ficha == null ? null : Number(ficha)];
      }),
    ),
  }));
  const sugerida = piezas[0]?.product.suppliers.find((s) => s.isPreferred)?.supplierId ?? piezas[0]?.product.suppliers[0]?.supplierId ?? null;
  return {
    direccion,
    producto,
    piezas: piezas.map((p) => ({ id: p.id, nombre: p.product.name, cantidad: p.quantity, costoActual: costoActual(p) })),
    compras: compras.map(({ id, etiqueta, costos }) => ({ id, etiqueta, costos })),
    proveedoras,
    proveedoraSugerida: proveedoras.some((p) => p.id === sugerida) ? sugerida : null,
  };
}

async function stockDe(db: Db, productIds: string[]) {
  const filas = await db.inventoryMovement.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _sum: { change: true },
  });
  return new Map(filas.map((f) => [f.productId, f._sum.change ?? 0]));
}

async function deudaDe(db: Db, supplierId: string) {
  const filas = await db.supplierLedgerEntry.groupBy({ by: ["type"], where: { supplierId }, _sum: { amount: true } });
  const suma = (t: string) => Number(filas.find((f) => f.type === t)?._sum.amount ?? 0);
  return suma("CHARGE") - suma("PAYMENT");
}

export type PlanCambio = {
  vista: VistaCambio;
  orderId: string;
  orderCode: string;
  orderStatus: string;
  saleId: string | null;
  direccion: DireccionCambio;
  /** Nuevo costo por unidad por pieza. */
  nuevos: { id: string; productId: string; cantidad: number; costo: number }[];
  compraCode: string | null;
  supplierId: string | null;
  cargosAAnular: Array<{ id: string } & Record<string, unknown>>;
  trabajosAAnular: Array<{ id: string } & Record<string, unknown>>;
  ofsAAvisar: string[];
  comboColor: string;
};

export async function planCambioModo(db: Db, entrada: EntradaCambio): Promise<PlanCambio | { error: string }> {
  const base = await cargar(db, entrada.orderItemId);
  if ("error" in base) return { error: base.error as string };
  const { order, piezas, direccion, producto, meta } = base;
  const sale = order.sale!;

  let nuevos: PlanCambio["nuevos"];
  let origen: string;
  let compraCode: string | null = null;
  let supplierId: string | null = null;
  let cargosAAnular: PlanCambio["cargosAAnular"] = [];
  let trabajosAAnular: PlanCambio["trabajosAAnular"] = [];
  let ofsAAvisar: string[] = [];
  const proveedoras: VistaCambio["proveedoras"] = [];

  if (direccion === "A_STOCK") {
    const compra = (await comprasConPiezas(db, piezas)).find((c) => c.id === entrada.compraId);
    if (!compra) return { error: "Elige la compra de inventario de donde salió." };
    compraCode = compra.code;
    origen = compra.etiqueta;
    nuevos = piezas.map((p) => ({ id: p.id, productId: p.productId, cantidad: p.quantity, costo: compra.costos[p.id] }));

    const cargos = await db.supplierLedgerEntry.findMany({
      where: { orderItemId: { in: piezas.map((p) => p.id) }, type: "CHARGE", dispatchId: null, inventoryMovementId: null },
      include: { supplier: { select: { name: true, displayName: true } } },
    });
    if (bloqueoPorAbonos(await db.supplierLedgerEntry.count({ where: { settlesEntryId: { in: cargos.map((c) => c.id) } } }))) {
      return { error: "Hay abonos amarrados a ese cargo: anúlalos primero." };
    }
    for (const sid of [...new Set(cargos.map((c) => c.supplierId))]) {
      const nombre = nombreProveedora(cargos.find((c) => c.supplierId === sid)!.supplier);
      const seAnula = cargos.filter((c) => c.supplierId === sid).reduce((s, c) => s + Number(c.amount), 0);
      const enOrden = await db.supplierLedgerEntry.groupBy({
        by: ["type"],
        where: { supplierId: sid, orderId: order.id },
        _sum: { amount: true },
      });
      const suma = (t: string) => Number(enOrden.find((f) => f.type === t)?._sum.amount ?? 0);
      const bloqueo = bloqueoPorPagosEnLaOrden({ proveedora: nombre, cargadoEnOrden: suma("CHARGE"), pagadoEnOrden: suma("PAYMENT"), seAnula });
      if (bloqueo) return { error: bloqueo };
      const deudaAntes = await deudaDe(db, sid);
      proveedoras.push({ nombre, deudaAntes, deudaDespues: deudaAntes - seAnula });
    }
    cargosAAnular = cargos.map(({ supplier, ...fila }) => {
      void supplier;
      return fila as unknown as { id: string } & Record<string, unknown>;
    });
    trabajosAAnular = piezas.flatMap((p) => p.productionJobs) as unknown as PlanCambio["trabajosAAnular"];
    const sinRecibir = new Set(order.manufacturingOrders.filter((of) => !of.receivedAt).map((of) => of.supplierId));
    ofsAAvisar = order.manufacturingOrders
      .filter((of) => sinRecibir.has(of.supplierId) && piezas.some((p) => p.confirmedSupplierId === of.supplierId))
      .map((of) => of.id);
  } else {
    const proveedora = entrada.supplierId
      ? await db.supplier.findFirst({
          where: { id: entrada.supplierId, type: "MANUFACTURER" },
          select: { id: true, name: true, displayName: true },
        })
      : null;
    if (!proveedora) return { error: "Elige la proveedora que lo fabrica." };
    const costos = entrada.costos ?? {};
    if (piezas.some((p) => costos[p.id] === undefined || !Number.isFinite(costos[p.id]) || costos[p.id] < 0)) {
      return { error: "Escribe el costo de cada pieza (0 o más)." };
    }
    supplierId = proveedora.id;
    origen = nombreProveedora(proveedora);
    nuevos = piezas.map((p) => ({ id: p.id, productId: p.productId, cantidad: p.quantity, costo: costos[p.id] }));
    const cargo = costoTotal(nuevos.map((n) => ({ cantidad: n.cantidad, costoUnitario: n.costo })));
    const deudaAntes = await deudaDe(db, proveedora.id);
    proveedoras.push({ nombre: origen, deudaAntes, deudaDespues: deudaAntes + cargo });
  }

  const stock = await stockDe(db, [...new Set(piezas.map((p) => p.productId))]);
  const signo = direccion === "A_STOCK" ? -1 : 1;
  if (direccion === "A_STOCK") {
    const falta = faltaStock(piezas.map((p) => ({ productId: p.productId, nombre: p.product.name, cantidad: p.quantity, stock: stock.get(p.productId) ?? 0 })));
    if (falta) return { error: falta };
  }
  const usado = new Map<string, number>();
  const piezasVista: PiezaVista[] = piezas.map((p) => {
    const antes = (stock.get(p.productId) ?? 0) + signo * (usado.get(p.productId) ?? 0);
    usado.set(p.productId, (usado.get(p.productId) ?? 0) + p.quantity);
    return {
      id: p.id,
      nombre: p.product.name,
      cantidad: p.quantity,
      stockAntes: antes,
      stockDespues: antes + signo * p.quantity,
      costoAntes: costoActual(p),
      costoDespues: nuevos.find((n) => n.id === p.id)!.costo,
    };
  });

  const lineasAntes = order.items.map((o) => ({ cantidad: o.quantity, costoUnitario: costoActual(o) }));
  const lineasDespues = order.items.map((o) => ({
    cantidad: o.quantity,
    costoUnitario: nuevos.find((n) => n.id === o.id)?.costo ?? costoActual(o),
  }));
  const fletes = sale.shippingCosts.reduce((s, f) => s + Number(f.amount), 0);
  const costoVentaAntes = costoTotal(lineasAntes);
  const costoVentaDespues = costoTotal(lineasDespues);

  return {
    vista: {
      direccion,
      producto,
      orden: displayCode(order.code),
      origen,
      piezas: piezasVista,
      proveedoras,
      costoVentaAntes,
      costoVentaDespues,
      gananciaAntes: gananciaVenta(Number(sale.total), costoVentaAntes, fletes),
      gananciaDespues: gananciaVenta(Number(sale.total), costoVentaDespues, fletes),
    },
    orderId: order.id,
    orderCode: order.code,
    orderStatus: order.status,
    saleId: order.saleId,
    direccion,
    nuevos,
    compraCode,
    supplierId,
    cargosAAnular,
    trabajosAAnular,
    ofsAAvisar,
    comboColor: meta.color.trim(),
  };
}

const YA_FABRICADA = new Set(["READY_FOR_DISPATCH", "DISPATCHED", "COMPLETED"]);

/** Escribe el plan. Correr dentro de una transacción, con el plan recién calculado en esa misma transacción. */
export async function aplicarCambioModo(
  tx: Db,
  plan: PlanCambio,
  actor: { id: string; name?: string | null },
  motivo: string,
): Promise<{ text: string; avisoIds: string[] }> {
  const { vista } = plan;
  let avisoIds: string[] = [];
  let sinPortada = false;
  const anulacion = {
    motivo: `Pasó a stock ${vista.producto} de ${plan.orderCode}: ${motivo}`,
    usuarioId: actor.id,
    usuarioNombre: actor.name,
  };

  if (plan.direccion === "A_STOCK") {
    await anularVarias(tx, "SupplierLedgerEntry", plan.cargosAAnular, { ...anulacion, codigo: () => plan.orderCode, que: "un cargo a la proveedora" });
    await anularVarias(tx, "ProductionJob", plan.trabajosAAnular, anulacion);
    for (const n of plan.nuevos) {
      await tx.inventoryMovement.create({
        data: { productId: n.productId, type: "OUT", change: -n.cantidad, note: `Salida por orden ${plan.orderCode}`, createdById: actor.id },
      });
      await tx.orderItem.update({
        where: { id: n.id },
        data: {
          fulfillmentMode: "STOCK",
          confirmedSupplierId: null,
          supplierPaymentStatus: null,
          purchaseCost: n.costo,
          stockCostSource: plan.compraCode,
        },
      });
    }
    if (plan.ofsAAvisar.length > 0) {
      const avisos = await tx.avisoColorOF.createManyAndReturn({
        data: plan.ofsAAvisar.map((manufacturingOrderId) => ({
          manufacturingOrderId,
          producto: vista.producto,
          colorViejo: plan.comboColor || "sin color",
          colorNuevo: AVISO_PRODUCTO_CANCELADO,
          creadoPorId: actor.id,
        })),
        select: { id: true },
      });
      avisoIds = avisos.map((aviso) => aviso.id);
    }
    // Sin producción viva: en producción vuelve a Liberada (como al cancelar un producto).
    if (plan.orderStatus === "IN_PRODUCTION" && (await tx.productionJob.count({ where: { orderId: plan.orderId } })) === 0) {
      await tx.order.update({ where: { id: plan.orderId }, data: { status: "RELEASED" } });
      await tx.orderStatusHistory.create({
        data: { orderId: plan.orderId, fromStatus: "IN_PRODUCTION", toStatus: "RELEASED", note: `Pasó a stock: ${vista.producto}`, changedById: actor.id },
      });
    }
  } else {
    const yaHecha = YA_FABRICADA.has(plan.orderStatus);
    const ultimo = await tx.productionJob.findFirst({ select: { code: true }, orderBy: { code: "desc" } });
    let numero = ultimo ? parseProductionJobCodeNumber(ultimo.code) : 0;
    // Lo que ya va despachado nace recogido (foto = portada del producto) para que la orden no vuelva a «Recoger».
    const enDespacho = await tx.dispatchItem.findMany({
      where: { orderItemId: { in: plan.nuevos.map((n) => n.id) } },
      select: { orderItemId: true, dispatch: { select: { status: true } } },
    });
    const portadas = await tx.productImage.findMany({
      where: { productId: { in: plan.nuevos.map((n) => n.productId) }, ...SOLO_FOTOS },
      orderBy: { order: "asc" },
      select: { productId: true, url: true },
    });
    for (const n of plan.nuevos) {
      await tx.inventoryMovement.create({
        data: { productId: n.productId, type: "IN", change: n.cantidad, note: `Vuelve al inventario: ${plan.orderCode} pasó a fabricación`, createdById: actor.id },
      });
      const cargo = n.costo * n.cantidad;
      const despachada = naceRecogida(enDespacho.filter((d) => d.orderItemId === n.id).map((d) => d.dispatch.status));
      const portada = despachada ? portadas.find((p) => p.productId === n.productId) : undefined;
      if (despachada && !portada) sinPortada = true;
      const recogida = Boolean(portada);
      await tx.orderItem.update({
        where: { id: n.id },
        data: {
          fulfillmentMode: "MANUFACTURE",
          confirmedSupplierId: plan.supplierId,
          purchaseCost: n.costo,
          stockCostSource: null,
          supplierPaymentStatus: cargo > 0 ? "PENDING" : null,
        },
      });
      if (portada) {
        await tx.orderItemPhoto.create({
          data: { orderItemId: n.id, url: portada.url, name: "Recogido automático: ya estaba despachado" },
        });
        if (marcarPagadaAlRecoger({ supplierPaymentStatus: cargo > 0 ? "PENDING" : null, purchaseCost: n.costo, quantity: n.cantidad })) {
          await tx.orderItem.update({ where: { id: n.id }, data: { supplierPaymentStatus: "PAID" } });
        }
      }
      if (cargo > 0) {
        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: plan.supplierId!,
            type: "CHARGE",
            amount: cargo,
            note: `Compra item - Orden ${plan.orderCode}`,
            saleId: plan.saleId,
            orderId: plan.orderId,
            orderItemId: n.id,
            createdById: actor.id,
          },
        });
      }
      numero += 1;
      await tx.productionJob.create({
        data: {
          code: buildProductionJobCode(numero),
          orderId: plan.orderId,
          orderItemId: n.id,
          // Si la orden ya pasó producción (o se entregó) o la pieza nace recogida, el trabajo queda hecho.
          status: yaHecha || recogida ? "DONE" : "IN_PROGRESS",
          quantity: n.cantidad,
          startedAt: new Date(),
          completedAt: yaHecha || recogida ? new Date() : null,
          createdById: actor.id,
        },
      });
    }
    if (plan.orderStatus === "DRAFT" || plan.orderStatus === "RELEASED") {
      await tx.order.update({ where: { id: plan.orderId }, data: { status: "IN_PRODUCTION" } });
      await tx.orderStatusHistory.create({
        data: { orderId: plan.orderId, fromStatus: plan.orderStatus as "DRAFT" | "RELEASED", toStatus: "IN_PRODUCTION", note: `Pasó a fabricación: ${vista.producto}`, changedById: actor.id },
      });
    }
  }

  const pesos = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;
  const deuda = vista.proveedoras.map((p) => `${p.nombre} ${pesos(p.deudaAntes)} → ${pesos(p.deudaDespues)}`).join("; ");
  const aviso = sinPortada ? " Ojo: ya estaba despachado pero el producto no tiene foto de portada; queda pendiente de recoger." : "";
  const text = `${vista.direccion === "A_STOCK" ? "Pasó a stock" : "Pasó a fabricación"} ${vista.producto} (${vista.origen}). Motivo: ${motivo}. Deuda: ${deuda || "sin cambio"}. Costo de productos: ${pesos(vista.costoVentaAntes)} → ${pesos(vista.costoVentaDespues)}.${aviso}`;
  await tx.orderNote.create({ data: { orderId: plan.orderId, text: text.slice(0, 1000), createdById: actor.id } });
  return { text, avisoIds };
}
