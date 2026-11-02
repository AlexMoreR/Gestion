// Revision de solo lectura (npm run ventas:revisar-costos): por que una venta quedo sin costo.
// Usa la misma regla de costo que Balances (pickCostItems + computeItemUnitCost).
import { computeItemUnitCost } from "../../../lib/order-item-cost";
import { pickCostItems } from "./calculations";

type ReviewItem = {
  name: string;
  quantity: number;
  purchaseCost: number | null;
  fulfillmentMode: string;
  baseCost: number;
  additionalCost: number;
};

// Motivos por los que la venta quedo mal; vacio = la venta esta bien.
export function saleCostIssues(
  orderItems: ReviewItem[] | null | undefined,
  quoteItems: Array<Omit<ReviewItem, "purchaseCost" | "fulfillmentMode">>,
): string[] {
  const items = pickCostItems(orderItems, quoteItems);
  if (items.length === 0) return ["sin productos (ni en la orden ni en la cotizacion)"];

  const issues: string[] = [];
  const zero = items.filter((item) => item.purchaseCost == null && item.baseCost + item.additionalCost === 0);
  if (zero.length > 0) issues.push(`producto con costo 0: ${[...new Set(zero.map((item) => item.name))].join(", ")}`);

  const total = items.reduce((sum, item) => sum + computeItemUnitCost(item) * item.quantity, 0);
  if (total === 0) issues.push("costo total 0");
  return issues;
}
