import { prisma } from "@/lib/prisma";

export type ProductPurchaseRow = {
  id: string;
  date: string;
  quantity: number;
  purchaseCost: number;
  isPaid: boolean;
  // Codigo de compra (COM-) y de la orden (ORD-) de origen, si existen.
  purchaseCode: string | null;
  orderCode: string | null;
};

/**
 * Historial de compras (entradas de inventario con cargo a proveedor) de un
 * producto: fecha, precio de compra y si el cargo ya fue pagado.
 *
 * El precio de compra vive en los SupplierLedgerEntry de tipo CHARGE ligados al
 * movimiento; el pago se determina por los PAYMENT que lo saldan (settlesEntryId).
 */
export async function getProductPurchaseHistory(productId: string): Promise<ProductPurchaseRow[]> {
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      productId,
      type: { in: ["IN", "ADJUSTMENT"] },
      ledgerEntries: { some: { type: "CHARGE" } },
    },
    orderBy: { movementDate: "desc" },
    select: {
      id: true,
      movementDate: true,
      change: true,
      purchaseCode: true,
      ledgerEntries: {
        where: { type: "CHARGE" },
        select: { id: true, amount: true },
      },
    },
  });

  const chargeIds = movements.flatMap((movement) => movement.ledgerEntries.map((entry) => entry.id));
  if (chargeIds.length === 0) {
    return [];
  }

  // Mapa codigo de compra (COM-) -> codigo de orden (ORD-).
  const purchaseCodes = Array.from(
    new Set(movements.map((m) => m.purchaseCode).filter((code): code is string => Boolean(code))),
  );
  const orders = purchaseCodes.length
    ? await prisma.order.findMany({
        where: { purchaseCode: { in: purchaseCodes } },
        select: { code: true, purchaseCode: true },
      })
    : [];
  const orderCodeByPurchase = new Map(orders.map((o) => [o.purchaseCode, o.code] as const));

  const payments = await prisma.supplierLedgerEntry.groupBy({
    by: ["settlesEntryId"],
    where: { type: "PAYMENT", settlesEntryId: { in: chargeIds } },
    _sum: { amount: true },
  });
  const paidByCharge = new Map(
    payments.map((payment) => [payment.settlesEntryId, Number(payment._sum.amount ?? 0)]),
  );

  return movements.map((movement) => {
    const purchaseCost = movement.ledgerEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
    // El movimiento esta pagado si cada cargo quedo totalmente saldado.
    const isPaid = movement.ledgerEntries.every(
      (entry) => (paidByCharge.get(entry.id) ?? 0) >= Number(entry.amount),
    );

    return {
      id: movement.id,
      date: movement.movementDate.toISOString(),
      quantity: movement.change,
      purchaseCost,
      isPaid,
      purchaseCode: movement.purchaseCode,
      orderCode: movement.purchaseCode ? orderCodeByPurchase.get(movement.purchaseCode) ?? null : null,
    };
  });
}
