import { computeItemUnitCost } from "../../../lib/order-item-cost";
import { roundMoney } from "../../../lib/pricing";
import { groupQuoteDisplayItems } from "../../../lib/quote-display-items";
import { parseQuoteItemMeta } from "../../../lib/quote-item-meta";
import type { QuoteProductSummary, SaleProductCostOrigin, SaleProductLine, SaleProductsSource } from "./entities";

// Productos reales de una venta para el MCP: los de la orden o, si no tiene, los de la cotizacion.
// Solo lectura: no toca Balances; el costo usa la misma regla (computeItemUnitCost).

export type SaleProductItemInput = {
  id: string;
  quantity: number;
  unitPrice: unknown;
  lineTotal: unknown;
  notes: string | null;
  fulfillmentMode: string;
  // Solo existe en la orden (costo confirmado con la proveedora).
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

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// De mejor a peor: el combo toma el peor origen de sus hijos.
const ORIGIN_RANK: Record<SaleProductCostOrigin, number> = {
  confirmado: 0,
  "estimado de catálogo": 1,
  "sin dato": 2,
};

function itemCost(item: SaleProductItemInput): { unitCost: number; origin: SaleProductCostOrigin } {
  const purchaseCost = toNullableNumber(item.purchaseCost);
  const unitCost = computeItemUnitCost({
    purchaseCost,
    fulfillmentMode: item.fulfillmentMode,
    baseCost: toNumber(item.product.baseCost),
    additionalCost: toNumber(item.product.additionalCost),
    preferredSupplierCost: toNullableNumber(item.product.preferredSupplierCost),
  });
  if (!(unitCost > 0)) return { unitCost: 0, origin: "sin dato" };
  if (purchaseCost != null) return { unitCost, origin: "confirmado" };
  return { unitCost, origin: "estimado de catálogo" };
}

function buildLines(items: SaleProductItemInput[]): SaleProductLine[] {
  // Mismo criterio de llave que groupQuoteDisplayItems: id del item o "combo:<comboKey>".
  const extras = new Map<string, { totalCost: number; origin: SaleProductCostOrigin; color: string }>();
  const metas = items.map((item) => parseQuoteItemMeta(item.notes));

  items.forEach((item, index) => {
    const meta = metas[index];
    const comboKey = meta.comboKey.trim();
    const key = comboKey ? `combo:${comboKey}` : item.id;
    const { unitCost, origin } = itemCost(item);
    const current = extras.get(key);
    if (!current) {
      extras.set(key, { totalCost: unitCost * item.quantity, origin, color: meta.color.trim() });
      return;
    }
    current.totalCost += unitCost * item.quantity;
    if (ORIGIN_RANK[origin] > ORIGIN_RANK[current.origin]) current.origin = origin;
    if (!current.color) current.color = meta.color.trim();
  });

  return groupQuoteDisplayItems(
    items.map((item, index) => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      product: item.product,
      meta: metas[index],
    })),
  ).map((line) => {
    const extra = extras.get(line.key);
    const totalCost = extra?.totalCost ?? 0;
    return {
      nombre: line.productName,
      codigo: line.productCode,
      cantidad: line.quantity,
      color: extra?.color || null,
      precio_unitario: roundMoney(line.unitPrice),
      total_linea: roundMoney(line.lineTotal),
      costo_unitario: roundMoney(line.quantity > 0 ? totalCost / line.quantity : totalCost),
      costo_origen: extra?.origin ?? "sin dato",
    };
  });
}

export function buildSaleProducts(params: {
  orderItems: SaleProductItemInput[] | null | undefined;
  quoteItems: SaleProductItemInput[] | null | undefined;
}): { fuente: SaleProductsSource; productos: SaleProductLine[] } {
  if (params.orderItems && params.orderItems.length > 0) {
    return { fuente: "orden", productos: buildLines(params.orderItems) };
  }
  if (params.quoteItems && params.quoteItems.length > 0) {
    return { fuente: "cotizacion", productos: buildLines(params.quoteItems) };
  }
  return { fuente: "ninguna", productos: [] };
}

// Lista corta de productos de una cotizacion (listar_cotizaciones): combos agrupados, sin costos.
export type QuoteProductSummaryInput = Pick<
  SaleProductItemInput,
  "id" | "quantity" | "unitPrice" | "lineTotal" | "notes"
> & { product: Pick<SaleProductItemInput["product"], "name" | "code" | "thumbnailUrl" | "description"> };

export function buildQuoteProductSummary(items: QuoteProductSummaryInput[]): QuoteProductSummary[] {
  const metas = items.map((item) => parseQuoteItemMeta(item.notes));
  // Color por linea (mismo criterio de llave que groupQuoteDisplayItems); el combo toma el primero que tenga.
  const colors = new Map<string, string>();
  items.forEach((item, index) => {
    const comboKey = metas[index].comboKey.trim();
    const key = comboKey ? `combo:${comboKey}` : item.id;
    if (!colors.get(key)) colors.set(key, metas[index].color.trim());
  });
  return groupQuoteDisplayItems(items.map((item, index) => ({ ...item, meta: metas[index] }))).map((line) => ({
    nombre: line.productName,
    codigo: line.productCode,
    color: colors.get(line.key) || null,
    cantidad: line.quantity,
  }));
}

export type ManufacturingOrderLink = { code: string; supplierName: string; shareToken: string };

export const MISSING_ORDER_NOTICE = "Falta crear la orden";
export const MISSING_MANUFACTURING_NOTICE =
  "Esta orden no tiene orden de fabricación para proveedora (stock o sin proveedora confirmada)";

type SupplierLink = { proveedora: string; orden_fabricacion: string; link: string };

// Enlaces publicos (sin sesion) de una venta. siteUrl llega de afuera: el dominio no conoce Next.
export function buildSaleLinks(params: {
  siteUrl: string;
  quoteShareToken: string | null;
  invoiceToken: string | null;
  hasOrder: boolean;
  manufacturingOrders: ManufacturingOrderLink[];
}) {
  const base = params.siteUrl.replace(/\/+$/, "");
  const supplierLinks: SupplierLink[] = params.manufacturingOrders.map((of) => ({
    proveedora: of.supplierName,
    orden_fabricacion: of.code,
    link: `${base}/fabricacion/${of.shareToken}`,
  }));
  return {
    link_cotizacion: params.quoteShareToken ? `${base}/cotizaciones/${params.quoteShareToken}` : null,
    link_venta: params.invoiceToken ? `${base}/sales/${params.invoiceToken}` : null,
    link_proveedora:
      supplierLinks.length === 0 ? null : supplierLinks.length === 1 ? supplierLinks[0] : supplierLinks,
    aviso_orden: params.hasOrder ? null : MISSING_ORDER_NOTICE,
    aviso_proveedora: params.hasOrder && supplierLinks.length === 0 ? MISSING_MANUFACTURING_NOTICE : null,
  };
}
