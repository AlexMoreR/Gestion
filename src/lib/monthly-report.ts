import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ahoraBogota } from "@/lib/corte-mes";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import type { DateRange } from "@/modules/balances/domain/entities";

// Token del link del informe. Si hay MONTHLY_REPORT_TOKEN se usa tal cual; si no,
// se deriva de AUTH_SECRET (ya existe en produccion) para no depender de Portainer.
// Devuelve "" si no hay ningun secreto (entonces el link queda deshabilitado).
export function reportToken(): string {
  const dedicated = process.env.MONTHLY_REPORT_TOKEN?.trim();
  if (dedicated) {
    return dedicated;
  }
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) {
    return "";
  }
  return createHash("sha256").update(`${secret}:informe-mensual`).digest("hex").slice(0, 40);
}

export type MonthlyReportProduct = {
  productId: string;
  code: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  margin: number;
};

export type MonthlyReport = {
  monthKey: string; // "YYYY-MM"
  monthLabel: string; // "Junio de 2026"
  sales: { total: number; count: number };
  profit: { net: number; marginPct: number; supplierCosts: number; shippingCosts: number };
  topByRevenue: MonthlyReportProduct[];
  topByMargin: MonthlyReportProduct[];
  quotes: { made: number; closed: number; closeRatePct: number };
};

// Rango [from, to) en UTC para un mes "YYYY-MM" (misma convencion que Balances).
export function monthRange(monthKey: string): DateRange | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 1)) };
}

// Mes anterior al actual (por defecto del informe: "el mes pasado").
export function previousMonthKey(now: Date = new Date()): string {
  const bogota = ahoraBogota(now);
  const year = bogota.getUTCFullYear();
  const month = bogota.getUTCMonth(); // 0-based; el mes anterior es este indice
  const date = new Date(Date.UTC(year, month - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function computeMonthlyReport(monthKey: string): Promise<MonthlyReport | null> {
  const period = monthRange(monthKey);
  if (!period) {
    return null;
  }

  const repository = createPrismaBalancesRepository();

  // 1 y 2: ventas, # pedidos, utilidad y margen (mismo criterio que Balances:
  // pagadas por completo, en el mes en que cuentan; contraentrega, al entregar).
  const metrics = await repository.getDashboardMetrics(period);

  // 3: top productos. Se toman las mismas ventas del mes que Balances y se
  // agrupan sus items por producto: ingreso = precio x cant, costo = costo compra x cant.
  const recognized = await repository.listProfitReport({ page: 1, pageSize: 500, period });
  const sales = await prisma.sale.findMany({
    where: { id: { in: recognized.items.map((row) => row.saleId) } },
    select: {
      order: {
        select: {
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              purchaseCost: true,
              product: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  });

  const productMap = new Map<string, MonthlyReportProduct>();
  for (const sale of sales) {
    for (const item of sale.order?.items ?? []) {
      const revenue = item.quantity * Number(item.unitPrice);
      const cost = item.quantity * Number(item.purchaseCost ?? 0);
      const current =
        productMap.get(item.product.id) ??
        {
          productId: item.product.id,
          code: item.product.code ?? "",
          name: item.product.name,
          units: 0,
          revenue: 0,
          cost: 0,
          margin: 0,
        };
      current.units += item.quantity;
      current.revenue += revenue;
      current.cost += cost;
      current.margin = current.revenue - current.cost;
      productMap.set(item.product.id, current);
    }
  }
  const products = [...productMap.values()];
  const topByRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topByMargin = [...products].sort((a, b) => b.margin - a.margin).slice(0, 5);

  // 4: cotizaciones hechas vs cerradas (con venta vinculada) en el mes.
  const [made, closed] = await Promise.all([
    prisma.quote.count({ where: { createdAt: { gte: period.from, lt: period.to } } }),
    prisma.quote.count({
      where: { createdAt: { gte: period.from, lt: period.to }, sale: { isNot: null } },
    }),
  ]);
  const closeRatePct = made > 0 ? (closed / made) * 100 : 0;

  const rawLabel = new Date(period.from).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    monthKey,
    monthLabel: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
    sales: { total: metrics.salesTotal, count: metrics.salesCount },
    profit: {
      net: metrics.netProfit,
      marginPct: metrics.marginPercentage,
      supplierCosts: metrics.supplierCosts,
      shippingCosts: metrics.shippingCosts,
    },
    topByRevenue,
    topByMargin,
    quotes: { made, closed, closeRatePct },
  };
}
