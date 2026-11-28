// Venta anulada: pasar a inventario un producto de Fabricación (sin crear ni anular cargos a la proveedora) y
// registrar devoluciones de dinero a la clienta (salidas de cuenta ligadas a la venta). Reglas en cancelled-sale.ts.
// Correr cada función dentro de una transacción: toman candado y leen dentro de ella.
import "server-only";
import type { Prisma } from "@prisma/client";
import { anularConMotivo } from "@/lib/anulaciones";
import { displayCode } from "@/lib/code-display";
import { linesToRecolor } from "@/lib/color-change";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { bloqueoPasarAInventario, maxDevolucion, parseDevolucion, type DevolucionInput } from "@/lib/cancelled-sale";

type Db = Prisma.TransactionClient;
type Actor = { id: string; name?: string | null };

const pesos = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;

export type PasoAInventario = {
  orderId: string;
  orderCode: string;
  saleId: string;
  saleCode: string;
  producto: string;
  piezas: { orderItemId: string; productId: string; nombre: string; cantidad: number; costo: number | null }[];
  text: string;
};

/** Suma al inventario la línea (o su combo completo) con la marca de la línea de origen. No toca la deuda. */
export async function pasarAInventarioTx(
  tx: Db,
  input: { orderItemId: string; motivo: string },
  actor: Actor,
): Promise<PasoAInventario | { error: string }> {
  const item = await tx.orderItem.findUnique({ where: { id: input.orderItemId }, select: { orderId: true } });
  if (!item) return { error: "Producto no encontrado." };
  // Candado por orden: dos clics no suman dos veces.
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${item.orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id: item.orderId },
    select: {
      id: true,
      code: true,
      status: true,
      sale: { select: { id: true, code: true, status: true, quoteId: true } },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          notes: true,
          quoteItemId: true,
          fulfillmentMode: true,
          purchaseCost: true,
          product: { select: { name: true, isBundle: true } },
        },
      },
    },
  });
  if (!order?.sale) return { error: "Solo se pasa a inventario un producto de una venta anulada." };
  const clicked = order.items.find((o) => o.id === input.orderItemId)!;
  const quoteItems = await tx.quoteItem.findMany({
    where: { quoteId: order.sale.quoteId },
    select: { id: true, notes: true, product: { select: { name: true, isBundle: true } } },
  });
  const grupo = linesToRecolor(
    clicked.id,
    quoteItems.map((q) => ({ id: q.id, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle })),
    order.items,
  );
  const piezas = order.items.filter((o) => grupo?.orderItemIds.includes(o.id) && o.fulfillmentMode === "MANUFACTURE");
  const yaPaso =
    (await tx.inventoryMovement.count({ where: { sourceOrderItemId: { in: grupo?.orderItemIds ?? [clicked.id] } } })) > 0;
  const bloqueo = bloqueoPasarAInventario({
    ventaEstado: order.sale.status,
    ordenEstado: order.status,
    modo: piezas.length > 0 ? "MANUFACTURE" : clicked.fulfillmentMode,
    yaPaso,
  });
  if (bloqueo) return { error: bloqueo };

  const meta = parseQuoteItemMeta(clicked.notes);
  const producto = piezas.length > 1 && meta.comboName ? meta.comboName : clicked.product.name;
  const venta = displayCode(order.sale.code);
  for (const pieza of piezas) {
    await tx.inventoryMovement.create({
      data: {
        productId: pieza.productId,
        type: "IN",
        change: pieza.quantity,
        note: `Vuelve al inventario: venta anulada ${venta} (${displayCode(order.code)}). Motivo: ${input.motivo}`.slice(0, 500),
        sourceOrderItemId: pieza.id,
        createdById: actor.id,
      },
    });
  }
  const text = `Pasó a inventario ${producto} de la venta anulada ${venta}, sin deuda nueva con la proveedora. Motivo: ${input.motivo}.`;
  await tx.orderNote.create({ data: { orderId: order.id, text: text.slice(0, 1000), createdById: actor.id } });
  return {
    orderId: order.id,
    orderCode: order.code,
    saleId: order.sale.id,
    saleCode: order.sale.code,
    producto,
    piezas: piezas.map((p) => ({
      orderItemId: p.id,
      productId: p.productId,
      nombre: p.product.name,
      cantidad: p.quantity,
      costo: p.purchaseCost === null ? null : Number(p.purchaseCost),
    })),
    text,
  };
}

async function pagadoYDevuelto(db: Db, saleId: string) {
  const [pagos, devoluciones] = await Promise.all([
    db.salePayment.aggregate({ where: { saleId }, _sum: { amount: true } }),
    db.accountMovement.aggregate({ where: { saleId, type: "OUT" }, _sum: { amount: true } }),
  ]);
  return { pagado: Number(pagos._sum.amount ?? 0), devuelto: Number(devoluciones._sum.amount ?? 0) };
}

export type DevolucionHecha = {
  movementId: string;
  saleId: string;
  saleCode: string;
  orderId: string | null;
  orderCode: string | null;
  monto: number;
  accountId: string;
  accountName: string;
  fecha: string;
  motivoRetroactivo: string | null;
  faltaDevolver: number;
  text: string;
};

/** Salida de la cuenta por lo devuelto a la clienta; nunca más de lo pagado en total. */
export async function registrarDevolucionTx(
  tx: Db,
  input: { saleId: string } & DevolucionInput,
  actor: Actor,
): Promise<DevolucionHecha | { error: string }> {
  // Candado por venta: dos devoluciones a la vez no pasan juntas de lo pagado.
  await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${input.saleId} FOR UPDATE`;
  const sale = await tx.sale.findUnique({
    where: { id: input.saleId },
    select: { id: true, code: true, status: true, order: { select: { id: true, code: true } } },
  });
  if (!sale) return { error: "Venta no encontrada." };
  if (sale.status !== "CANCELLED") return { error: "Solo se registra una devolución en una venta anulada." };
  const { pagado, devuelto } = await pagadoYDevuelto(tx, sale.id);
  const parsed = parseDevolucion(input, maxDevolucion(pagado, devuelto));
  if (!parsed.ok) return { error: parsed.error };
  const d = parsed.value;
  const cuenta = await tx.account.findFirst({
    where: { id: d.accountId, isActive: true, type: { not: "OWNER" } },
    select: { id: true, name: true },
  });
  if (!cuenta) return { error: "Elige una cuenta activa del negocio." };

  const venta = displayCode(sale.code);
  const note = [
    `Devolución de dinero a la clienta – ${venta}. Motivo: ${d.motivo}`,
    d.motivoRetroactivo ? `Registro atrasado: ${d.motivoRetroactivo}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  const movement = await tx.accountMovement.create({
    data: {
      accountId: cuenta.id,
      type: "OUT",
      amount: d.monto,
      note: note.slice(0, 2000),
      // Fecha escrita por una persona: medianoche UTC (vale ese día tal cual).
      movementDate: new Date(`${d.fecha}T00:00:00Z`),
      saleId: sale.id,
      createdById: actor.id,
    },
    select: { id: true },
  });
  const faltaDevolver = maxDevolucion(pagado, devuelto + d.monto);
  const text = `Devolución de dinero a la clienta de ${venta}: ${pesos(d.monto)} desde ${cuenta.name} (${d.fecha}). Pagado ${pesos(
    pagado,
  )} · Devuelto ${pesos(devuelto + d.monto)} · Falta devolver ${pesos(faltaDevolver)}. Motivo: ${d.motivo}.`;
  if (sale.order) {
    await tx.orderNote.create({ data: { orderId: sale.order.id, text: text.slice(0, 1000), createdById: actor.id } });
  }
  return {
    movementId: movement.id,
    saleId: sale.id,
    saleCode: sale.code,
    orderId: sale.order?.id ?? null,
    orderCode: sale.order?.code ?? null,
    monto: d.monto,
    accountId: cuenta.id,
    accountName: cuenta.name,
    fecha: d.fecha,
    motivoRetroactivo: d.motivoRetroactivo,
    faltaDevolver,
    text,
  };
}

/** Anula una devolución mal escrita: copia en RegistroAnulado y bitácora (anularConMotivo). */
export async function anularDevolucionTx(
  tx: Db,
  input: { movementId: string; motivo: string },
  actor: Actor,
): Promise<{ saleId: string; orderId: string | null } | { error: string }> {
  const movement = await tx.accountMovement.findUnique({ where: { id: input.movementId } });
  if (!movement?.saleId || movement.type !== "OUT") return { error: "Devolución no encontrada." };
  const sale = await tx.sale.findUnique({ where: { id: movement.saleId }, select: { code: true, order: { select: { id: true } } } });
  await anularConMotivo(tx, {
    tabla: "AccountMovement",
    registro: movement,
    codigo: sale?.code ?? null,
    monto: movement.amount,
    motivo: input.motivo,
    usuarioId: actor.id,
    usuarioNombre: actor.name,
    que: "una devolución de dinero a la clienta",
  });
  if (sale?.order) {
    await tx.orderNote.create({
      data: {
        orderId: sale.order.id,
        text: `Anuló una devolución de ${pesos(Number(movement.amount))}. Motivo: ${input.motivo}`.slice(0, 1000),
        createdById: actor.id,
      },
    });
  }
  return { saleId: movement.saleId, orderId: sale?.order?.id ?? null };
}

export type VentaAnuladaVista = {
  saleId: string;
  saleCode: string;
  pagado: number;
  devuelto: number;
  faltaDevolver: number;
  /** Una fila por producto de Fabricación (un combo, una sola fila). */
  productos: { orderItemId: string; nombre: string; cantidad: number; costo: number; proveedora: string | null; yaPaso: boolean }[];
  devoluciones: { id: string; fecha: Date; monto: number; cuenta: string; nota: string | null }[];
};

/** Datos de la tarjeta «Venta anulada: productos y devolución»; null si la orden no es de una venta anulada. */
export async function ventaAnuladaVista(db: Db, orderId: string): Promise<VentaAnuladaVista | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      type: true,
      status: true,
      sale: { select: { id: true, code: true, status: true, quoteId: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productId: true,
          quantity: true,
          notes: true,
          quoteItemId: true,
          fulfillmentMode: true,
          purchaseCost: true,
          product: { select: { name: true, isBundle: true } },
          confirmedSupplier: { select: { name: true, displayName: true } },
        },
      },
    },
  });
  if (!order?.sale || order.type !== "SALE" || order.status !== "CANCELLED" || order.sale.status !== "CANCELLED") return null;
  const [quoteItems, pasados, plata, devoluciones] = await Promise.all([
    db.quoteItem.findMany({
      where: { quoteId: order.sale.quoteId },
      select: { id: true, notes: true, product: { select: { name: true, isBundle: true } } },
    }),
    db.inventoryMovement.findMany({
      where: { sourceOrderItemId: { in: order.items.map((i) => i.id) } },
      select: { sourceOrderItemId: true },
    }),
    pagadoYDevuelto(db, order.sale.id),
    db.accountMovement.findMany({
      where: { saleId: order.sale.id, type: "OUT" },
      orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, movementDate: true, amount: true, note: true, account: { select: { name: true } } },
    }),
  ]);
  const yaPasados = new Set(pasados.map((p) => p.sourceOrderItemId));
  const lineas = quoteItems.map((q) => ({ id: q.id, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle }));
  const vistos = new Set<string>();
  const productos: VentaAnuladaVista["productos"] = [];
  for (const item of order.items) {
    if (item.fulfillmentMode !== "MANUFACTURE" || vistos.has(item.id)) continue;
    const ids = linesToRecolor(item.id, lineas, order.items)?.orderItemIds ?? [item.id];
    const piezas = order.items.filter((o) => ids.includes(o.id) && o.fulfillmentMode === "MANUFACTURE");
    for (const p of piezas) vistos.add(p.id);
    const meta = parseQuoteItemMeta(item.notes);
    const proveedora = item.confirmedSupplier ? item.confirmedSupplier.displayName || item.confirmedSupplier.name : null;
    productos.push({
      orderItemId: item.id,
      nombre: piezas.length > 1 && meta.comboName ? meta.comboName : item.product.name,
      cantidad: item.quantity,
      costo: piezas.reduce((s, p) => s + Number(p.purchaseCost ?? 0) * p.quantity, 0),
      proveedora,
      yaPaso: ids.some((id) => yaPasados.has(id)),
    });
  }
  return {
    saleId: order.sale.id,
    saleCode: order.sale.code,
    pagado: plata.pagado,
    devuelto: plata.devuelto,
    faltaDevolver: maxDevolucion(plata.pagado, plata.devuelto),
    productos,
    devoluciones: devoluciones.map((d) => ({
      id: d.id,
      fecha: d.movementDate,
      monto: Number(d.amount),
      cuenta: d.account.name,
      nota: d.note,
    })),
  };
}
