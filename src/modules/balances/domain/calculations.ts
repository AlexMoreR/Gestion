import type { Account, AccountBalance, DashboardMetrics, SaleProfit, SupplierBalance } from "./entities";

export type SaleProfitInput = {
  saleId: string;
  saleCode: string;
  saleAmount: number;
  createdAt: Date;
  clientName: string | null;
  orderItems: Array<{
    quantity: number;
    purchaseCost: number | null;
  }>;
  shippingCosts: number[];
};

export function calculateSaleProfitSummary(input: SaleProfitInput): SaleProfit {
  const supplierCosts = input.orderItems.reduce((sum, item) => {
    const unitCost = item.purchaseCost ?? 0;
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

export function summarizeAccountBalance(
  account: Account,
  totals: { ingreso: number; gasto: number; movimientosIn: number; movimientosOut: number },
): AccountBalance {
  const movimientos = totals.movimientosIn - totals.movimientosOut;
  const balance = account.openingBalance + totals.ingreso - totals.gasto + movimientos;

  return {
    ...account,
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
