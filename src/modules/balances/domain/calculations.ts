import { computeItemUnitCost } from "../../../lib/order-item-cost";
import { colombiaDayKey, inColombiaPeriod } from "../../../lib/colombia-time";
import type { Account, AccountBalance, DashboardMetrics, DateRange, SaleProfit, SupplierBalance } from "./entities";

export type SaleProfitInput = {
  saleId: string;
  saleCode: string;
  saleAmount: number;
  createdAt: Date;
  clientName: string | null;
  pendingDelivery?: boolean;
  orderItems: Array<{
    quantity: number;
    purchaseCost: number | null;
    // Para stock, el costo real de inventario = base + envio/flete del producto.
    fulfillmentMode: string;
    baseCost: number;
    additionalCost: number;
  }>;
  shippingCosts: number[];
};

type CostItem = SaleProfitInput["orderItems"][number];

// Venta sin orden (o con la orden vacia): el costo sale de los productos de la
// cotizacion como stock (costo base + flete del catalogo). Con orden, no cambia.
// Generica para que el script de revision (ventas:revisar-costos) conserve el nombre del producto.
export function pickCostItems<T extends Omit<CostItem, "purchaseCost" | "fulfillmentMode">>(
  orderItems: Array<T & Pick<CostItem, "purchaseCost" | "fulfillmentMode">> | null | undefined,
  quoteItems: T[],
): Array<T & Pick<CostItem, "purchaseCost" | "fulfillmentMode">> {
  if (orderItems && orderItems.length > 0) return orderItems;
  return quoteItems.map((item) => ({ ...item, purchaseCost: null, fulfillmentMode: "STOCK" }));
}

export function calculateSaleProfitSummary(input: SaleProfitInput): SaleProfit {
  const supplierCosts = input.orderItems.reduce((sum, item) => {
    const unitCost = computeItemUnitCost({
      purchaseCost: item.purchaseCost,
      fulfillmentMode: item.fulfillmentMode,
      baseCost: item.baseCost,
      additionalCost: item.additionalCost,
    });
    if (!unitCost) {
      return sum;
    }

    return sum + unitCost * item.quantity;
  }, 0);
  const shippingCosts = input.shippingCosts.reduce((sum, cost) => sum + cost, 0);
  const netProfit = input.saleAmount - supplierCosts - shippingCosts;
  const marginPercentage = input.saleAmount > 0 ? (netProfit / input.saleAmount) * 100 : 0;

  return {
    saleId: input.saleId,
    saleCode: input.saleCode,
    saleAmount: input.saleAmount,
    supplierCosts,
    shippingCosts,
    netProfit,
    marginPercentage,
    createdAt: input.createdAt,
    clientName: input.clientName,
    pendingDelivery: input.pendingDelivery ?? false,
  };
}

export function summarizeSupplierBalance(
  supplierId: string,
  supplierName: string,
  entries: Array<{ amount: number; createdAt: Date; saleCode: string | null }>,
): SupplierBalance {
  const paymentCount = entries.length;
  const totalPaid = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const lastEntry = entries[0] ?? null;

  return {
    supplierId,
    supplierName,
    paymentCount,
    totalPaid,
    lastPaymentAt: lastEntry?.createdAt ?? null,
    lastSaleCode: lastEntry?.saleCode ?? null,
  };
}

// Donde cae un flujo de cuenta: antes del periodo (suma al saldo inicial), dentro, o fuera.
// Fecha escrita (medianoche UTC) = ese dia; otra hora se lee en Colombia. Sin periodo todo cuenta.
export function accountFlowBucket(date: Date | null, period?: DateRange): "prior" | "current" | null {
  if (!period) return "current";
  if (!date) return null;
  if (colombiaDayKey(date) < colombiaDayKey(period.from)) return "prior";
  return inColombiaPeriod(date, { start: period.from, end: period.to }) ? "current" : null;
}

export function summarizeAccountBalance(
  account: Account,
  totals: { ingreso: number; gasto: number; movimientosIn: number; movimientosOut: number },
  // Saldo inicial del periodo (cierre del mes anterior). Por defecto, el saldo
  // inicial configurado de la cuenta (vista sin periodo / todo el historial).
  periodOpening: number = account.openingBalance,
): AccountBalance {
  const movimientos = totals.movimientosIn - totals.movimientosOut;
  // Balance = neto del periodo (ingresos - gastos +/- movimientos). El saldo
  // inicial se muestra aparte como referencia, no se suma aqui.
  const balance = totals.ingreso - totals.gasto + movimientos;

  return {
    ...account,
    periodOpening,
    ingreso: totals.ingreso,
    gasto: totals.gasto,
    movimientos,
    balance,
  };
}

export function summarizeDashboardMetrics(sales: SaleProfit[]): DashboardMetrics {
  const salesCount = sales.length;
  const salesTotal = sales.reduce((sum, sale) => sum + sale.saleAmount, 0);
  const supplierCosts = sales.reduce((sum, sale) => sum + sale.supplierCosts, 0);
  const shippingCosts = sales.reduce((sum, sale) => sum + sale.shippingCosts, 0);
  const netProfit = sales.reduce((sum, sale) => sum + sale.netProfit, 0);
  const marginPercentage = salesTotal > 0 ? (netProfit / salesTotal) * 100 : 0;
  const profitableSalesCount = sales.filter((sale) => sale.netProfit > 0).length;
  const sortedByProfit = [...sales].sort((a, b) => b.netProfit - a.netProfit);

  return {
    salesCount,
    salesTotal,
    supplierCosts,
    shippingCosts,
    netProfit,
    marginPercentage,
    profitableSalesCount,
    bestSale: sortedByProfit[0] ?? null,
    worstSale: sortedByProfit[sortedByProfit.length - 1] ?? null,
  };
}
