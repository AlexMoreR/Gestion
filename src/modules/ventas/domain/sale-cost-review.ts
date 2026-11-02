// Revisión de solo lectura (parte 3, nov-2026): por qué una venta ya creada quedó sin productos o sin
// costo, para avisarle a Alexander (script `npm run ventas:revisar-costos`). Regla pura, sin Prisma.
import { computeItemUnitCost } from "../../../lib/order-item-cost";

export type ReviewItem = {
  quantity: number;
  purchaseCost: number | null;
  fulfillmentMode: string;
  baseCost: number;
  additionalCost: number;
  productName: string;
};

/** Motivos por los que la venta hay que revisarla; vacío = está bien. */
export function saleCostReviewReasons(
  orderItems: ReviewItem[],
  quoteItems: Array<Omit<ReviewItem, "purchaseCost" | "fulfillmentMode">>,
): string[] {
  // Misma regla que pickCostItems (Balances): sin orden o con la orden vacía, cuenta la cotización como stock.
  const items = (
    orderItems.length > 0
      ? orderItems
      : quoteItems.map((item) => ({ ...item, purchaseCost: null, fulfillmentMode: "STOCK" }))
  ).filter((item) => item.quantity > 0);
  if (items.length === 0) return ["sin productos"];

  const reasons: string[] = [];
  const withoutCost = Array.from(
    new Set(
      items
        .filter((item) => item.purchaseCost == null && !(item.baseCost + item.additionalCost > 0))
        .map((item) => item.productName),
    ),
  );
  if (withoutCost.length > 0) reasons.push(`producto con costo 0: ${withoutCost.join(", ")}`);

  const totalCost = items.reduce((sum, item) => sum + computeItemUnitCost(item) * item.quantity, 0);
  if (!(totalCost > 0)) reasons.push("costo total 0");
  return reasons;
}
