// Productos de una venta para el asesor: los de la orden o, si la orden no
// tiene items (o no existe), los de la cotizacion. Reglas puras.
import { computeItemUnitCost } from "../../../lib/order-item-cost";
import { roundMoney } from "../../../lib/pricing";
import { groupQuoteDisplayItems } from "../../../lib/quote-display-items";
import { parseQuoteItemMeta } from "../../../lib/quote-item-meta";
import type { SaleCostOrigin, SaleProductLine, SaleProductsSource } from "./entities";

export type SaleItemInput = {
  id: string;
  quantity: number;
  unitPrice: unknown;
  lineTotal: unknown;
  notes: string | null;
  fulfillmentMode: string;
  // Solo los items de la orden lo tienen (costo confirmado con la proveedora).
  purchaseCost?: unknown;
  product: {
    name: string;
    code: string | null;
    thumbnailUrl: string | null;
    description: string | null;
    baseCost: unknown;
    additionalCost: unknown;
    preferredSupplierCost: unknown;
  };
};

const ORIGIN_RANK: Record<SaleCostOrigin, number> = {
  confirmado: 0,
  "estimado de catálogo": 1,
  "sin dato": 2,
};

function toNumber(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toNullableNumber(value: unknown): number | null {
  return value == null ? null : toNumber(value);
}

function itemCost(item: SaleItemInput): { unit: number; origin: SaleCostOrigin } {
  const purchaseCost = toNullableNumber(item.purchaseCost);
  const unit = computeItemUnitCost({
    purchaseCost,
    fulfillmentMode: item.fulfillmentMode,
    baseCost: toNumber(item.product.baseCost),
    additionalCost: toNumber(item.product.additionalCost),
    preferredSupplierCost: toNullableNumber(item.product.preferredSupplierCost),
  });
  if (unit <= 0) return { unit: 0, origin: "sin dato" };
  return { unit, origin: purchaseCost != null ? "confirmado" : "estimado de catálogo" };
}

export function buildSaleProducts(params: {
  orderItems: SaleItemInput[];
  quoteItems: SaleItemInput[];
}): { fuente: SaleProductsSource; productos: SaleProductLine[] } {
  const fuente: SaleProductsSource =
    params.orderItems.length > 0 ? "orden" : params.quoteItems.length > 0 ? "cotizacion" : "ninguna";
  const items = fuente === "orden" ? params.orderItems : params.quoteItems;

  // Costo total y peor origen por fila; la clave es la misma que usa groupQuoteDisplayItems.
  const costByKey = new Map<string, { total: number; origin: SaleCostOrigin }>();
  const withMeta = items.map((item) => {
    const meta = parseQuoteItemMeta(item.notes);
    const comboKey = meta.comboKey.trim();
    const key = comboKey ? `combo:${comboKey}` : item.id;
    const cost = itemCost(item);
    const current = costByKey.get(key);
    costByKey.set(key, {
      total: (current?.total ?? 0) + cost.unit * item.quantity,
      origin: current && ORIGIN_RANK[current.origin] > ORIGIN_RANK[cost.origin] ? current.origin : cost.origin,
    });
    return { item, meta, key };
  });

  const colorByKey = new Map<string, string>();
  for (const { meta, key } of withMeta) {
    const color = meta.color.trim();
    if (color && !colorByKey.has(key)) colorByKey.set(key, color);
  }

  // Los combos se muestran como un solo producto (igual que en la factura).
  const productos = groupQuoteDisplayItems(
    withMeta.map(({ item, meta }) => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      product: item.product,
      meta,
    })),
  ).map((line) => {
    const cost = costByKey.get(line.key) ?? { total: 0, origin: "sin dato" as const };
    return {
      nombre: line.productName,
      codigo: line.productCode,
      cantidad: line.quantity,
      color: colorByKey.get(line.key) ?? null,
      precio_unitario: roundMoney(line.unitPrice),
      total_linea: roundMoney(line.lineTotal),
      costo_unitario: roundMoney(line.quantity > 0 ? cost.total / line.quantity : cost.total),
      costo_origen: cost.origin,
    };
  });

  return { fuente, productos };
}
