// «Agregar adicional» a un producto de una venta ya creada (nov-2026). En UNA transacción: la línea de la
// cotización (notas + total), la de la orden (precio y total), los totales de cotización, venta y orden, el
// estado de la venta según lo pagado, y si trae costo, el costo de la línea y el cargo a la proveedora. Los
// abonos no se tocan. Reglas puras en sale-item-extra.ts. No es server action: la llama orders-actions.
import "server-only";
import { Prisma } from "@prisma/client";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { displayCode } from "@/lib/code-display";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta, stringifyQuoteItemMeta } from "@/lib/quote-item-meta";
import { CancelItemBlockedError, formatCop } from "@/lib/sale-item-swap.server";
import { aplicarAdicional, bloqueoAdicional, lineasDelAdicional, type AdicionalNuevo } from "@/lib/sale-item-extra";
import { saleStatusForPaid } from "@/modules/ventas/domain/sale-paid-status";

type Db = Prisma.TransactionClient | typeof prisma;
const redondear = (valor: number) => Math.round(valor * 100) / 100;

export type VistaAdicional = {
  producto: string;
  totalAntes: number;
  totalDespues: number;
  pagado: number;
  saldoAntes: number;
  saldoDespues: number;
};

/** Lee la venta y las líneas que reciben el adicional y revisa los bloqueos. Lanza CancelItemBlockedError. */
async function planDelAdicional(db: Db, orderItemId: string, adicional: AdicionalNuevo) {
  const item = await db.orderItem.findUnique({ where: { id: orderItemId }, select: { orderId: true } });
  if (!item) {
    // Un producto cancelado ya no está en la orden: su copia quedó en Anulados.
    const anulado = await db.registroAnulado.count({ where: { tabla: "OrderItem", registroId: orderItemId } });
    throw new CancelItemBlockedError(
      bloqueoAdicional({ saleStatus: "ACTIVE", itemCancelado: anulado > 0, costo: 0, fulfillmentMode: "", confirmedSupplierId: null }) ??
        "Producto no encontrado.",
    );
  }
  const order = await db.order.findUniqueOrThrow({
    where: { id: item.orderId },
    select: {
      id: true,
      code: true,
      type: true,
      subtotal: true,
      items: { orderBy: { id: "asc" }, include: { product: { select: { name: true } } } },
      sale: {
        select: { id: true, code: true, status: true, quoteId: true, total: true, subtotal: true, downPaymentAmount: true },
      },
    },
  });
  const sale = order.type === "SALE" ? order.sale : null;
  const quoteItems = sale
    ? await db.quoteItem.findMany({
        where: { quoteId: sale.quoteId },
        orderBy: { id: "asc" },
        include: { product: { select: { name: true, isBundle: true } } },
      })
    : [];
  const lineas = lineasDelAdicional(
    orderItemId,
    quoteItems.map((q) => ({ ...q, productName: q.product.name, isBundle: q.product.isBundle })),
    order.items,
  );
  const bloqueo = bloqueoAdicional({
    saleStatus: sale?.status ?? null,
    itemCancelado: !lineas,
    costo: adicional.costo,
    fulfillmentMode: lineas?.orderItem.fulfillmentMode ?? "",
    confirmedSupplierId: lineas?.orderItem.confirmedSupplierId ?? null,
  });
  if (bloqueo || !sale || !lineas) throw new CancelItemBlockedError(bloqueo ?? "Producto no encontrado.");
  if (!lineas.quoteItem) throw new CancelItemBlockedError("Ese producto no tiene su línea en la cotización.");

  const meta = parseQuoteItemMeta(lineas.quoteItem.notes);
  const producto = meta.comboName || lineas.quoteItem.product.name;
  const totalAntes = Number(sale.total);
  const totalDespues = redondear(totalAntes + adicional.precio);
  const pagado = Number(sale.downPaymentAmount);
  const vista: VistaAdicional = {
    producto,
    totalAntes,
    totalDespues,
    pagado,
    saldoAntes: Math.max(redondear(totalAntes - pagado), 0),
    saldoDespues: Math.max(redondear(totalDespues - pagado), 0),
  };
  return { order, sale, quoteItem: lineas.quoteItem, orderItem: lineas.orderItem, meta, vista };
}

/** Antes y después (total y saldo) sin guardar nada: para el diálogo. */
export async function previsualizarAdicional(input: { orderItemId: string } & AdicionalNuevo): Promise<VistaAdicional | { error: string }> {
  try {
    return (await planDelAdicional(prisma, input.orderItemId, input)).vista;
  } catch (error) {
    if (error instanceof CancelItemBlockedError) return { error: error.message };
    throw error;
  }
}

/** Suma el adicional. Devuelve el mensaje para la pantalla; un bloqueo sale como CancelItemBlockedError. */
export async function agregarAdicionalAVenta(input: { orderItemId: string; userId: string } & AdicionalNuevo): Promise<string> {
  const actor = await getActivityActor();
  return prisma.$transaction(async (tx) => {
    const { order, sale, quoteItem, orderItem, meta, vista } = await planDelAdicional(tx, input.orderItemId, input);
    const { precio, costo, descripcion } = input;

    // 1) Línea de la cotización: el precio va en additionalCost (sube el total de la línea) y en la lista.
    const nuevoMeta = aplicarAdicional(meta, {
      descripcion,
      precio,
      costo,
      porId: actor.id,
      porNombre: actor.name ?? "",
      en: new Date().toISOString(),
    });
    await tx.quoteItem.update({
      where: { id: quoteItem.id },
      data: {
        notes: stringifyQuoteItemMeta(nuevoMeta),
        lineTotal: new Prisma.Decimal(redondear(Number(quoteItem.lineTotal) + precio)),
      },
    });

    // 2) Línea de la orden: misma regla de la orden (total = precio × cantidad), así suma lo mismo que la venta.
    const cantidad = Math.max(orderItem.quantity, 1);
    await tx.orderItem.update({
      where: { id: orderItem.id },
      data: {
        unitPrice: new Prisma.Decimal(redondear(Number(orderItem.unitPrice) + precio / cantidad)),
        lineTotal: new Prisma.Decimal(redondear(Number(orderItem.lineTotal) + precio)),
        // purchaseCost es por unidad (la ganancia lo multiplica por la cantidad).
        ...(costo > 0
          ? { purchaseCost: new Prisma.Decimal(redondear(Number(orderItem.purchaseCost ?? 0) + costo / cantidad)) }
          : {}),
      },
    });

    // 3) Totales y estado de la venta según lo pagado (una venta pagada que ahora debe vuelve a ACTIVE).
    await tx.quote.update({ where: { id: sale.quoteId }, data: { subtotal: { increment: precio }, total: { increment: precio } } });
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        total: new Prisma.Decimal(vista.totalDespues),
        subtotal: new Prisma.Decimal(redondear(Number(sale.subtotal) + precio)),
        status: saleStatusForPaid(vista.pagado, vista.totalDespues, sale.status),
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        total: new Prisma.Decimal(vista.totalDespues),
        subtotal: new Prisma.Decimal(redondear(Number(order.subtotal) + precio)),
      },
    });

    // 4) Con costo: cargo a la proveedora confirmada, como los cargos de fabricación.
    if (costo > 0 && orderItem.confirmedSupplierId) {
      await tx.supplierLedgerEntry.create({
        data: {
          supplierId: orderItem.confirmedSupplierId,
          type: "CHARGE",
          amount: new Prisma.Decimal(costo),
          note: `Adicional: ${descripcion}`,
          saleId: sale.id,
          orderId: order.id,
          orderItemId: orderItem.id,
          createdById: input.userId,
        },
      });
    }

    // 5) Nota de la orden y bitácora.
    const texto = `Adicional: ${descripcion} +${formatCop(precio)} (total ${formatCop(vista.totalAntes)} → ${formatCop(vista.totalDespues)})`;
    await tx.orderNote.create({ data: { orderId: order.id, text: texto, createdById: actor.id } });
    await logActivityTx(tx, actor, {
      action: "UPDATE",
      entityType: "SALE",
      entityId: sale.id,
      entityCode: sale.code,
      summary: `${texto} en ${vista.producto} (${order.code})`,
      before: { ventaTotal: vista.totalAntes, saldo: vista.saldoAntes, ventaEstado: sale.status },
      after: {
        ventaTotal: vista.totalDespues,
        saldo: vista.saldoDespues,
        adicional: { descripcion, precio, costo },
        quoteItemId: quoteItem.id,
        orderItemId: orderItem.id,
      },
    });
    return `Se agregó «${descripcion}» (${formatCop(precio)}) a ${vista.producto} en ${displayCode(sale.code)}. Total: ${formatCop(
      vista.totalDespues,
    )} · Saldo: ${formatCop(vista.saldoDespues)}.`;
  });
}
