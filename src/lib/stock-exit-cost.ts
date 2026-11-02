import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeFifoStockCost, type FifoStockCost, type FifoStockEntry } from "../modules/inventory/domain/fifo-cost";

type Db = typeof prisma | Prisma.TransactionClient;

export type StockExitCostInput = {
  productId: string;
  quantity: number;
  /** Unidades de esta pieza ya tomadas por otras líneas del mismo lote. */
  alreadyTaken?: number;
  /** Stock antes del lote; si no viene, se suma de los movimientos. */
  stockOnHand?: number;
};

/**
 * Costo de las unidades que salen de bodega: lo que cobró la proveedora en la compra que
 * las entró (ORD- de la compra, o el cargo INV- si se entró sin orden); si no hay compra,
 * el costo de catálogo (baseCost + additionalCost).
 * Las entradas se ordenan por `movementDate`: editar una compra rehace su entrada pero
 * conserva la fecha de la compra, así que no cambia de lugar en la fila.
 */
export async function computeStockExitCost(input: StockExitCostInput, db: Db = prisma): Promise<FifoStockCost> {
  const [product, movements, stockAgg] = await Promise.all([
    db.product.findUnique({ where: { id: input.productId }, select: { baseCost: true, additionalCost: true } }),
    db.inventoryMovement.findMany({
      where: { productId: input.productId, type: "IN", change: { gt: 0 } },
      orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
      select: {
        change: true,
        purchaseCode: true,
        ledgerEntries: {
          where: { type: "CHARGE", note: { startsWith: "Compra inventario" } },
          select: { amount: true, code: true },
        },
      },
    }),
    input.stockOnHand === undefined
      ? db.inventoryMovement.aggregate({ where: { productId: input.productId }, _sum: { change: true } })
      : null,
  ]);

  const purchaseCodes = Array.from(new Set(movements.map((m) => m.purchaseCode).filter((c): c is string => Boolean(c))));
  const purchases = purchaseCodes.length
    ? await db.order.findMany({
        where: { type: "PURCHASE", purchaseCode: { in: purchaseCodes } },
        select: {
          code: true,
          purchaseCode: true,
          items: { where: { productId: input.productId }, select: { quantity: true, purchaseCost: true } },
        },
      })
    : [];
  const purchaseByCode = new Map(purchases.map((order) => [order.purchaseCode, order] as const));

  const entries: FifoStockEntry[] = movements.map((movement) => {
    const order = movement.purchaseCode ? purchaseByCode.get(movement.purchaseCode) : undefined;
    if (order) {
      // Costo por unidad de las líneas de esta pieza en la compra (sin el flete del producto).
      const lines = order.items.filter((item) => item.purchaseCost !== null);
      const units = lines.reduce((sum, item) => sum + item.quantity, 0);
      const total = lines.reduce((sum, item) => sum + Number(item.purchaseCost) * item.quantity, 0);
      return { quantity: movement.change, unitCost: units > 0 ? total / units : null, purchaseCode: order.code };
    }
    // Entrada sin orden de compra: el cargo a la proveedora ligado al movimiento.
    if (movement.ledgerEntries.length > 0) {
      const total = movement.ledgerEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
      return {
        quantity: movement.change,
        unitCost: total / movement.change,
        purchaseCode: movement.purchaseCode ?? movement.ledgerEntries[0].code,
      };
    }
    return { quantity: movement.change, unitCost: null, purchaseCode: null };
  });

  return computeFifoStockCost({
    entries,
    stockOnHand: input.stockOnHand ?? stockAgg?._sum.change ?? 0,
    quantityOut: input.quantity,
    catalogUnitCost: Number(product?.baseCost ?? 0) + Number(product?.additionalCost ?? 0),
    alreadyTaken: input.alreadyTaken,
  });
}
