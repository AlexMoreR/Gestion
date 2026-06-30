import "server-only";
import type { DateRange } from "@/modules/balances/domain/entities";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { createPrismaExpensesRepository } from "@/modules/expenses/infrastructure/prisma-expenses-repository";

export type MonthClosureSummary = {
  salesCount: number;
  salesTotal: number;
  supplierCosts: number;
  shippingCosts: number;
  operatingExpenses: number;
  netProfit: number;
  marginPct: number;
};

// Calcula el resumen de cierre de un mes: ventas, costos directos (proveedores +
// envio), gastos operativos y la ganancia neta real. Reutiliza los mismos
// calculos del modulo de Balances para que las cifras coincidan con esa pantalla.
// Ganancia = ventas - (costos proveedores + envio) - gastos operativos.
export async function computeMonthClosureSummary(period: DateRange): Promise<MonthClosureSummary> {
  const balancesRepository = createPrismaBalancesRepository();
  const expensesRepository = createPrismaExpensesRepository();

  const [metrics, expenseMetrics] = await Promise.all([
    balancesRepository.getDashboardMetrics(period),
    expensesRepository.getMetrics(period),
  ]);

  const operatingExpenses = expenseMetrics.totalAmount;
  const directCosts = metrics.supplierCosts + metrics.shippingCosts;
  const netProfit = metrics.salesTotal - directCosts - operatingExpenses;
  const marginPct = metrics.salesTotal > 0 ? (netProfit / metrics.salesTotal) * 100 : 0;

  return {
    salesCount: metrics.salesCount,
    salesTotal: metrics.salesTotal,
    supplierCosts: metrics.supplierCosts,
    shippingCosts: metrics.shippingCosts,
    operatingExpenses,
    netProfit,
    marginPct,
  };
}
