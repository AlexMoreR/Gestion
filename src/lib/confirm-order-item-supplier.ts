import "server-only";
import type { Prisma } from "@prisma/client";
import { buildProductionJobCode, parseProductionJobCodeNumber } from "@/lib/orders";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";

// Confirmar proveedor y costo de un item de fabricacion, sin formulario ni redirect:
// guarda proveedor y costo, crea el cargo al proveedor y manda el item a produccion.
// No es server action a proposito (vive fuera de "use server").

export type ConfirmOrderItemSupplierMotivo = "item_no_encontrado" | "orden_cerrada" | "proveedor_no_permitido";

export type ConfirmOrderItemSupplierResult =
  | { ok: true; orderId: string }
  | { ok: false; motivo: ConfirmOrderItemSupplierMotivo };

// Debe correr dentro de prisma.$transaction. unitCost es el costo por unidad del item.
export async function confirmOrderItemSupplier(
  tx: Prisma.TransactionClient,
  input: { orderItemId: string; supplierId: string; unitCost: number; actorId: string },
): Promise<ConfirmOrderItemSupplierResult> {
  const orderItem = await tx.orderItem.findUnique({
    where: { id: input.orderItemId },
    include: {
      order: { select: { id: true, code: true, status: true, saleId: true } },
      product: { select: { suppliers: { select: { supplierId: true } } } },
      productionJobs: { select: { id: true } },
    },
  });

  if (!orderItem) {
    return { ok: false, motivo: "item_no_encontrado" };
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    return { ok: false, motivo: "orden_cerrada" };
  }

  const supplierAllowed = orderItem.product.suppliers.some((entry) => entry.supplierId === input.supplierId);
  if (!supplierAllowed) {
    return { ok: false, motivo: "proveedor_no_permitido" };
  }

  const meta = parseQuoteItemMeta(orderItem.notes);
  const jobNotes = [meta.description, meta.color ? `Color: ${meta.color}` : ""]
    .filter(Boolean)
    .join(" - ");

  // El cargo (saldo) al proveedor se genera al confirmar la compra/fabricacion,
  // una sola vez por item. Antes se generaba al recoger.
  const chargeAmount = Number(input.unitCost) * orderItem.quantity;
  const shouldCharge = orderItem.supplierPaymentStatus === null && chargeAmount > 0;

  await tx.orderItem.update({
    where: { id: orderItem.id },
    data: {
      confirmedSupplierId: input.supplierId,
      purchaseCost: input.unitCost,
      confirmedAt: new Date(),
      ...(shouldCharge ? { supplierPaymentStatus: "PENDING" } : {}),
    },
  });

  if (shouldCharge) {
    await tx.supplierLedgerEntry.create({
      data: {
        supplierId: input.supplierId,
        type: "CHARGE",
        amount: chargeAmount,
        note: `Compra item - Orden ${orderItem.order.code}`,
        saleId: orderItem.order.saleId,
        orderId: orderItem.order.id,
        orderItemId: orderItem.id,
        createdById: input.actorId,
      },
    });
  }

  // Al confirmar (Fabricar) se envia el item a produccion, una sola vez.
  if (orderItem.productionJobs.length === 0) {
    const lastJob = await tx.productionJob.findFirst({
      select: { code: true },
      orderBy: { code: "desc" },
    });
    const baseCodeNumber = lastJob ? parseProductionJobCodeNumber(lastJob.code) : 0;

    let code = "";
    for (let offset = 0; offset < 30; offset += 1) {
      const candidate = buildProductionJobCode(baseCodeNumber + 1 + offset);
      const exists = await tx.productionJob.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      if (!exists) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new Error("No se pudo asignar codigo de produccion");
    }

    await tx.productionJob.create({
      data: {
        code,
        orderId: orderItem.order.id,
        orderItemId: orderItem.id,
        status: "IN_PROGRESS",
        quantity: orderItem.quantity,
        notes: jobNotes || null,
        startedAt: new Date(),
        createdById: input.actorId,
      },
    });

    if (orderItem.order.status === "DRAFT" || orderItem.order.status === "RELEASED") {
      await tx.order.update({
        where: { id: orderItem.order.id },
        data: { status: "IN_PRODUCTION" },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: orderItem.order.id,
          fromStatus: orderItem.order.status,
          toStatus: "IN_PRODUCTION",
          note: "Item confirmado y enviado a produccion",
          changedById: input.actorId,
        },
      });
    }
  }

  return { ok: true, orderId: orderItem.order.id };
}
