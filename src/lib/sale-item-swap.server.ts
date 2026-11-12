// «Cambiar producto» de una venta en un solo paso (nov-2026): reactiva la orden si se pidió, agrega el
// producto nuevo, cancela el viejo con el motivo y recalcula total y saldo, todo en UNA transacción (si
// algo falla no queda nada a medias). Los abonos no se tocan. Aquí viven también las versiones `…Tx` de
// «Cancelar producto» y «Reactivar» (sus acciones en orders-actions.ts las usan). No es server action.
import "server-only";
import { Prisma, type OrderStatus } from "@prisma/client";
import { syncOrderStatusAfterProduction } from "@/app/actions/orders-actions";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { anularVarias, bloqueoPorAbonos } from "@/lib/anulaciones";
import { displayCode } from "@/lib/code-display";
import { linesToRecolor, ofsConCambioDeColor } from "@/lib/color-change";
import { estadoAlReactivar, reactivateStockNote, stockToRetake } from "@/lib/order-cancellation";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { agregarLineasTx, type DatosAgregar } from "@/lib/sale-add-lines.server";
import {
  AVISO_PRODUCTO_CANCELADO,
  bloqueoCancelarProducto,
  montoACancelar,
  saldoAFavor,
} from "@/lib/sale-item-cancel";
import { saleStatusForPaid } from "@/modules/ventas/domain/sale-paid-status";

type Actor = Awaited<ReturnType<typeof getActivityActor>>;

/** Un bloqueo que se lanza dentro de la transacción para deshacer todo; su texto va a la pantalla. */
export class CancelItemBlockedError extends Error {}

export const formatCop = (valor: number) => `$${Math.round(valor).toLocaleString("es-CO")}`;

export type ResultadoCancelar =
  | { error: string }
  | { error: null; producto: string; monto: number; nuevoTotal: number; aFavor: number; proveedoras: string[] };

/**
 * Cancela un producto de una venta (un combo, todas sus piezas). La línea no se borra sin copia: la de la
 * cotización y la de la orden quedan en RegistroAnulado con el motivo. Si estaba confirmada, se deshace
 * sola (stock vuelve al inventario; fabricación sin recibir anula su cargo con la proveedora y su
 * producción, y la OF muestra el aviso). Baja el total de la cotización, la venta y la orden; los abonos no
 * se tocan. Con `enCambio` no bloquea por ser el único producto y no deja nota ni bitácora propias.
 */
export async function cancelarProductoTx(
  tx: Prisma.TransactionClient,
  actor: Actor,
  {
    orderId,
    orderItemId,
    motivo,
    createdById,
    enCambio = false,
  }: { orderId: string; orderItemId: string; motivo: string; createdById: string; enCambio?: boolean },
): Promise<ResultadoCancelar> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      subtotal: true,
      sale: {
        select: { id: true, code: true, status: true, quoteId: true, total: true, subtotal: true, downPaymentAmount: true },
      },
      items: {
        include: {
          product: { select: { name: true } },
          _count: { select: { photos: true, dispatchItems: true, reversals: true, returnItems: true } },
        },
      },
      manufacturingOrders: {
        select: { id: true, supplierId: true, receivedAt: true, supplier: { select: { name: true, displayName: true } } },
      },
      returns: { where: { closedAt: null, annulledAt: null }, select: { id: true } },
    },
  });
  if (!order) return { error: "Orden no encontrada." };
  const quoteItems = order.sale
    ? await tx.quoteItem.findMany({
        where: { quoteId: order.sale.quoteId },
        include: { product: { select: { name: true, isBundle: true } } },
      })
    : [];
  const lines = linesToRecolor(
    orderItemId,
    quoteItems.map((q) => ({ id: q.id, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle })),
    order.items,
  );
  const piezas = order.items.filter((o) => lines?.orderItemIds.includes(o.id));
  const lineasCotizacion = quoteItems.filter((q) => lines?.quoteItemIds.includes(q.id));
  const recibidas = new Set(order.manufacturingOrders.filter((of) => of.receivedAt).map((of) => of.supplierId));
  const bloqueo = bloqueoCancelarProducto({
    esVenta: order.type === "SALE",
    ordenEstado: order.status,
    ventaEstado: order.sale?.status ?? null,
    devolucionAbierta: order.returns.length > 0,
    piezasOrden: order.items.length,
    enCambio,
    piezas: piezas.map((o) => ({
      fulfillmentMode: o.fulfillmentMode,
      despachos: o._count.dispatchItems,
      devolucionesOReversas: o._count.reversals + o._count.returnItems,
      fotos: o._count.photos,
      supplierPaymentStatus: o.supplierPaymentStatus,
      ofRecibida: Boolean(o.confirmedSupplierId && recibidas.has(o.confirmedSupplierId)),
    })),
  });
  if (bloqueo || !order.sale) return { error: bloqueo ?? "Solo se cancelan productos de una orden de venta." };
  const sale = order.sale;
  const ids = piezas.map((o) => o.id);
  const pagosProveedora = await tx.supplierLedgerEntry.count({ where: { orderItemId: { in: ids }, type: "PAYMENT" } });
  if (pagosProveedora > 0) return { error: "Ya se le pagó a la proveedora por este producto: anula ese pago primero." };

  const meta = parseQuoteItemMeta(lineasCotizacion[0]?.notes ?? piezas[0].notes);
  const producto = meta.comboName || lineasCotizacion[0]?.product.name || piezas[0].product.name;
  const monto = montoACancelar(lineasCotizacion, piezas);
  const nuevoTotal = Math.max(Math.round((Number(sale.total) - monto) * 100) / 100, 0);
  const pagado = Number(sale.downPaymentAmount);
  const anulacion = {
    motivo: `Canceló ${producto} de ${order.code}: ${motivo}`,
    usuarioId: actor.id,
    usuarioNombre: actor.name,
  };
  // OF a avisar: las de las piezas de fabricación confirmadas (antes de deshacer la confirmación).
  const ofIds = ofsConCambioDeColor(piezas, order.manufacturingOrders);

  // 1) Deshacer lo confirmado: stock vuelve al inventario; fabricación anula su producción y su cargo.
  for (const pieza of piezas) {
    if (pieza.fulfillmentMode === "STOCK") {
      if (pieza.confirmedAt) {
        await tx.inventoryMovement.create({
          data: {
            productId: pieza.productId,
            type: "IN",
            change: pieza.quantity,
            note: `Producto cancelado en ${order.code}: vuelve al inventario`,
            createdById,
          },
        });
      }
      continue;
    }
    const charges = await tx.supplierLedgerEntry.findMany({
      where: { orderItemId: pieza.id, type: "CHARGE", dispatchId: null, inventoryMovementId: null },
    });
    const settled = await tx.supplierLedgerEntry.count({
      where: { type: "PAYMENT", settlesEntryId: { in: charges.map((row) => row.id) } },
    });
    const blocked = bloqueoPorAbonos(settled);
    if (blocked) throw new CancelItemBlockedError(blocked);
    await anularVarias(tx, "ProductionJob", await tx.productionJob.findMany({ where: { orderItemId: pieza.id } }), anulacion);
    await anularVarias(tx, "SupplierLedgerEntry", charges, {
      ...anulacion,
      codigo: (row) => (row.code as string | null) ?? order.code,
    });
  }

  // 2) La línea de la orden y la de la cotización quedan copiadas con el motivo (y se quitan).
  await anularVarias(
    tx,
    "OrderItem",
    piezas.map(({ product, _count, ...fila }) => {
      void _count;
      return { ...fila, productName: product.name };
    }),
    { ...anulacion, codigo: () => order.code },
  );
  await anularVarias(
    tx,
    "QuoteItem",
    lineasCotizacion.map(({ product, ...fila }) => ({ ...fila, productName: product.name, saleCode: sale.code })),
    { ...anulacion, codigo: () => sale.code },
  );

  // 3) Totales: cotización, venta y orden bajan lo que valía el producto; el estado sale de lo pagado.
  if (lineasCotizacion.length > 0) {
    await tx.quote.update({
      where: { id: sale.quoteId },
      data: { subtotal: { decrement: monto }, total: { decrement: monto } },
    });
  }
  await tx.sale.update({
    where: { id: sale.id },
    data: {
      total: new Prisma.Decimal(nuevoTotal),
      subtotal: new Prisma.Decimal(Math.max(Number(sale.subtotal) - monto, 0)),
      status: saleStatusForPaid(pagado, nuevoTotal, sale.status),
    },
  });
  await tx.order.update({
    where: { id: order.id },
    data: {
      total: new Prisma.Decimal(nuevoTotal),
      subtotal: new Prisma.Decimal(Math.max(Number(order.subtotal) - monto, 0)),
    },
  });

  // 4) Estado de la orden: sin producción vuelve a Liberada; si lo que queda ya está hecho, Lista para despacho.
  if (order.status === "IN_PRODUCTION" && (await tx.productionJob.count({ where: { orderId: order.id } })) === 0) {
    await tx.order.update({ where: { id: order.id }, data: { status: "RELEASED" } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: "IN_PRODUCTION",
        toStatus: "RELEASED",
        note: `Producto cancelado: ${producto}`,
        changedById: createdById,
      },
    });
  } else {
    await syncOrderStatusAfterProduction(tx, order.id, createdById);
  }

  // 5) Aviso a la proveedora en su OF, nota de la orden y bitácora.
  if (ofIds.length > 0) {
    await tx.avisoColorOF.createMany({
      data: ofIds.map((manufacturingOrderId) => ({
        manufacturingOrderId,
        producto,
        colorViejo: meta.color.trim() || "sin color",
        colorNuevo: AVISO_PRODUCTO_CANCELADO,
        creadoPorId: actor.id,
      })),
    });
  }
  const aFavor = saldoAFavor(pagado, nuevoTotal);
  const text = `Canceló ${producto} (${formatCop(monto)}). Motivo: ${motivo}. Total de la venta: ${formatCop(nuevoTotal)}${
    aFavor > 0 ? ` · saldo a favor de la clienta: ${formatCop(aFavor)}` : ""
  }`;
  if (!enCambio) {
    await tx.orderNote.create({ data: { orderId: order.id, text, createdById: actor.id } });
    await logActivityTx(tx, actor, {
      action: "UPDATE",
      entityType: "ORDER",
      entityId: order.id,
      entityCode: order.code,
      summary: `${text} (${sale.code})`,
      before: {
        ventaTotal: Number(sale.total),
        ventaEstado: sale.status,
        orderItemIds: ids,
        quoteItemIds: lineasCotizacion.map((q) => q.id),
      },
      after: { ventaTotal: nuevoTotal, monto, motivo: motivo, avisoOFs: ofIds },
    });
  }
  const proveedoras = order.manufacturingOrders
    .filter((of) => ofIds.includes(of.id))
    .map((of) => of.supplier.displayName || of.supplier.name);
  return { error: null, producto, monto, nuevoTotal, aFavor, proveedoras };
}

/**
 * Reactiva una orden de venta cancelada: vuelve al estado de antes de la última cancelación y saca otra vez
 * del stock lo que la cancelación repuso. No toca la venta, los abonos ni Balances.
 */
export async function reactivarOrdenTx(
  tx: Prisma.TransactionClient,
  actor: Actor,
  { orderId, motivo, changedById }: { orderId: string; motivo: string; changedById: string },
): Promise<{ error: string } | { error: null; toStatus: OrderStatus; retaken: Map<string, number> }> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      type: true,
      status: true,
      code: true,
      sale: { select: { status: true } },
      history: { select: { fromStatus: true, toStatus: true, createdAt: true } },
    },
  });
  if (!order) return { error: "Orden no encontrada" };
  if (order.type !== "SALE" || order.status !== "CANCELLED") {
    return { error: "Solo se reactiva una orden de venta cancelada." };
  }
  if (!order.sale || order.sale.status === "CANCELLED") {
    return { error: "La venta está cancelada: la orden no se puede reactivar." };
  }

  const toStatus = estadoAlReactivar(order.history) as OrderStatus;
  const retakeNotes = [`Reversa por cancelacion de orden ${order.code}`, reactivateStockNote(order.code)];

  // El estado se cambia solo si sigue CANCELLED: dos clics a la vez no sacan el stock dos veces.
  const updated = await tx.order.updateMany({
    where: { id: order.id, status: "CANCELLED" },
    data: { status: toStatus },
  });
  if (updated.count === 0) return { error: "La orden ya no está cancelada." };

  await tx.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: "CANCELLED", toStatus, note: `Reactivada. Motivo: ${motivo}`, changedById },
  });

  const movements = await tx.inventoryMovement.findMany({
    where: { note: { in: retakeNotes } },
    select: { productId: true, change: true, note: true },
  });
  const retaken = stockToRetake(movements, order.code);
  if (retaken.size > 0) {
    await tx.inventoryMovement.createMany({
      data: Array.from(retaken.entries()).map(([productId, quantity]) => ({
        productId,
        type: "OUT" as const,
        change: -quantity,
        note: reactivateStockNote(order.code),
        createdById: changedById,
      })),
    });
  }

  await logActivityTx(tx, actor, {
    action: "UPDATE",
    entityType: "ORDER",
    entityId: order.id,
    entityCode: order.code,
    summary: `Reactivó la orden ${order.code}. Motivo: ${motivo}`,
    before: { status: "CANCELLED" },
    after: { status: toStatus, motivo, stockSacado: Object.fromEntries(retaken) },
  });
  return { error: null, toStatus, retaken };
}

/** OF (sin recibir o recibidas) con la proveedora donde ya está el producto (un combo, sus piezas). */
export async function ofsDelProducto(orderItemId: string): Promise<{ code: string; proveedora: string }[]> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: {
      order: {
        select: {
          items: { include: { product: { select: { name: true } } } },
          sale: { select: { quoteId: true } },
          manufacturingOrders: { select: { id: true, code: true, supplierId: true, supplier: { select: { name: true, displayName: true } } } },
        },
      },
    },
  });
  if (!item) return [];
  const order = item.order;
  const quoteItems = order.sale
    ? await prisma.quoteItem.findMany({ where: { quoteId: order.sale.quoteId }, include: { product: { select: { name: true, isBundle: true } } } })
    : [];
  const lines = linesToRecolor(
    orderItemId,
    quoteItems.map((q) => ({ id: q.id, notes: q.notes, productName: q.product.name, isBundle: q.product.isBundle })),
    order.items,
  );
  const piezas = order.items.filter((o) => lines?.orderItemIds.includes(o.id));
  const ids = ofsConCambioDeColor(piezas, order.manufacturingOrders);
  return order.manufacturingOrders
    .filter((of) => ids.includes(of.id))
    .map((of) => ({ code: of.code, proveedora: of.supplier.displayName || of.supplier.name }));
}

/**
 * Los tres pasos en orden y en una sola transacción. Devuelve el mensaje para la pantalla; un bloqueo
 * (orden entregada, producto despachado, OF recibida...) deshace todo y sale como CancelItemBlockedError.
 */
export async function cambiarProductoDeVenta(input: {
  agregar: Omit<DatosAgregar, "sale">;
  saleId: string;
  orderItemId: string;
  motivo: string;
  reactivar: boolean;
  createdById: string;
}): Promise<string> {
  const actor = await getActivityActor();
  return prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUnique({
      where: { id: input.orderItemId },
      select: { order: { select: { id: true, code: true, status: true, saleId: true } } },
    });
    const order = item?.order;
    if (!order || order.saleId !== input.saleId) throw new CancelItemBlockedError("Ese producto no es de esta venta.");

    // 1) Reactivar la orden, si estaba cancelada (sin la casilla no se llega aquí: lo revisa faltaEnCambio).
    if (order.status === "CANCELLED") {
      if (!input.reactivar) throw new CancelItemBlockedError("La orden está cancelada: marca «Reactivar la orden».");
      const reactivada = await reactivarOrdenTx(tx, actor, {
        orderId: order.id,
        motivo: `Cambio de producto: ${input.motivo}`,
        changedById: input.createdById,
      });
      if (reactivada.error !== null) throw new CancelItemBlockedError(reactivada.error);
    }

    // 2) Agregar el nuevo (con la venta leída dentro de la transacción).
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: input.saleId },
      select: {
        id: true,
        code: true,
        status: true,
        total: true,
        subtotal: true,
        downPaymentAmount: true,
        order: { select: { id: true, code: true, status: true, subtotal: true } },
      },
    });
    if (sale.status === "CANCELLED") throw new CancelItemBlockedError("La venta está cancelada.");
    const agregado = await agregarLineasTx(tx, actor, { ...input.agregar, sale }, { registrar: false });

    // 3) Cancelar el viejo con el motivo (stock, cargo a la proveedora, aviso en la OF, RegistroAnulado).
    const cancelado = await cancelarProductoTx(tx, actor, {
      orderId: order.id,
      orderItemId: input.orderItemId,
      motivo: input.motivo,
      createdById: input.createdById,
      enCambio: true,
    });
    if (cancelado.error !== null) throw new CancelItemBlockedError(cancelado.error);

    // 4) Una sola nota y una sola entrada en la bitácora, con el total y el saldo que quedan.
    const pagado = Number(sale.downPaymentAmount);
    const total = cancelado.nuevoTotal;
    const saldo = Math.round((total - pagado) * 100) / 100;
    const nuevo = agregado.nombres.join(", ");
    const saldoTexto = saldo >= 0 ? `Saldo: ${formatCop(saldo)}` : `Saldo a favor de la clienta: ${formatCop(-saldo)}`;
    const texto = `Cambió ${cancelado.producto} por ${nuevo}. Motivo: ${input.motivo}. Total: ${formatCop(total)} · ${saldoTexto}`;
    await tx.orderNote.create({ data: { orderId: order.id, text: texto, createdById: actor.id } });
    await logActivityTx(tx, actor, {
      action: "UPDATE",
      entityType: "ORDER",
      entityId: order.id,
      entityCode: order.code,
      summary: `${texto} (${sale.code})`,
      before: { ventaTotal: Number(sale.total), ventaEstado: sale.status, ordenEstado: order.status, orderItemId: input.orderItemId },
      after: {
        ventaTotal: total,
        pagado,
        saldo,
        agregado: agregado.monto,
        cancelado: cancelado.monto,
        motivo: input.motivo,
        reactivada: order.status === "CANCELLED",
      },
    });
    const avisar = cancelado.proveedoras.length ? `. Avísale a ${cancelado.proveedoras.join(" y ")} en la pestaña Fabricación` : "";
    return `Se cambió ${cancelado.producto} por ${nuevo} en ${displayCode(order.code)}. Total: ${formatCop(total)} · ${saldoTexto}${avisar}.`;
  }, { timeout: 30_000 }); // tres pasos en una transacción: más que los 5 s de siempre
}
