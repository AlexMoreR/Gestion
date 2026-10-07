// Reporte de ventas por origen (/admin/ventas/origen). Calculos puros, sin Prisma.
// Las ventas que entran y su monto/fecha vienen de Balances (ver la pagina): aqui solo se agrupan.

import { adKeyFromDetail, effectiveOrigin, SALE_ORIGIN_LABEL, SALE_ORIGIN_ORDER, type SaleOriginCode } from "./sale-origin";

export type OriginReportSale = {
  saleId: string;
  recognizedAt: Date; // fecha de entrega (criterio de Balances)
  amount: number; // valor de la venta (sale.total)
  profit: number; // ganancia neta de Balances
  origin: unknown; // null = sin dato
  originDetail: unknown;
};

export type OriginReportRow = {
  origin: SaleOriginCode;
  label: string;
  count: number;
  revenue: number;
  profit: number;
  averageTicket: number;
  revenueShare: number; // % de la facturacion del grupo
};

export type OriginReportTotals = { count: number; revenue: number; profit: number; averageTicket: number };

export type OriginMonthReport = {
  month: string; // "YYYY-MM"
  rows: OriginReportRow[];
  totals: OriginReportTotals;
};

export type AdReportRow = {
  key: string;
  adTitle: string | null;
  adId: string | null;
  count: number;
  revenue: number;
  profit: number;
  averageTicket: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function totalsOf(sales: OriginReportSale[]): OriginReportTotals {
  const revenue = sales.reduce((sum, sale) => sum + sale.amount, 0);
  const profit = sales.reduce((sum, sale) => sum + sale.profit, 0);
  return {
    count: sales.length,
    revenue: round2(revenue),
    profit: round2(profit),
    averageTicket: sales.length > 0 ? round2(revenue / sales.length) : 0,
  };
}

// Una fila por origen con ventas, en orden fijo. "Sin dato" SIEMPRE aparece (aunque sea 0) para
// no inflar el resultado de los canales: lo que no se sabe tiene que verse.
export function summarizeByOrigin(sales: OriginReportSale[]): OriginReportRow[] {
  const total = totalsOf(sales);
  return SALE_ORIGIN_ORDER.map((origin) => {
    const group = sales.filter((sale) => effectiveOrigin(sale.origin) === origin);
    const totals = totalsOf(group);
    return {
      origin,
      label: SALE_ORIGIN_LABEL[origin],
      count: totals.count,
      revenue: totals.revenue,
      profit: totals.profit,
      averageTicket: totals.averageTicket,
      revenueShare: total.revenue > 0 ? round2((totals.revenue / total.revenue) * 100) : 0,
    };
  }).filter((row) => row.count > 0 || row.origin === "SIN_DATO");
}

// Mes en UTC: misma convencion de limites de mes que Balances (resolveMonthPeriod).
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Meses con ventas, del mas reciente al mas viejo.
export function groupByMonth(sales: OriginReportSale[]): OriginMonthReport[] {
  const byMonth = new Map<string, OriginReportSale[]>();
  for (const sale of sales) {
    const key = monthKey(sale.recognizedAt);
    byMonth.set(key, [...(byMonth.get(key) ?? []), sale]);
  }
  return [...byMonth.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([month, group]) => ({ month, rows: summarizeByOrigin(group), totals: totalsOf(group) }));
}

// Ventas por anuncio (originDetail.adId / adTitle). Solo las que traen anuncio; las de Meta Ads sin
// anuncio identificado van aparte (ver metaAdsWithoutAd) para que no se pierdan.
export function summarizeByAd(sales: OriginReportSale[]): AdReportRow[] {
  const groups = new Map<string, { adTitle: string | null; adId: string | null; sales: OriginReportSale[] }>();
  for (const sale of sales) {
    const ad = adKeyFromDetail(sale.originDetail);
    if (!ad) continue;
    const current = groups.get(ad.key);
    if (current) {
      current.sales.push(sale);
      current.adTitle = current.adTitle ?? ad.adTitle;
    } else {
      groups.set(ad.key, { adTitle: ad.adTitle, adId: ad.adId, sales: [sale] });
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const totals = totalsOf(group.sales);
      return {
        key,
        adTitle: group.adTitle,
        adId: group.adId,
        count: totals.count,
        revenue: totals.revenue,
        profit: totals.profit,
        averageTicket: totals.averageTicket,
      };
    })
    .sort((left, right) => right.revenue - left.revenue || left.key.localeCompare(right.key));
}

export function metaAdsWithoutAd(sales: OriginReportSale[]): OriginReportTotals {
  return totalsOf(
    sales.filter((sale) => effectiveOrigin(sale.origin) === "META_ADS" && !adKeyFromDetail(sale.originDetail)),
  );
}

export function reportTotals(sales: OriginReportSale[]): OriginReportTotals {
  return totalsOf(sales);
}
