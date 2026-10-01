// Calculos puros del asesor. Imports relativos (Vitest no resuelve el alias "@/").
import { calculateMarginPctFromPrice, calculateProfit, roundMoney } from "../../../lib/pricing";
import type { DashboardMetrics } from "../../balances/domain/entities";
import type {
  CommissionSaleInput,
  DayRange,
  ProductRow,
  QuoteRow,
  QuoteStatusCode,
} from "./entities";

// --- Fechas -----------------------------------------------------------------

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export class AsesorInputError extends Error {}

function parseIsoDay(value: string, field: string): { year: number; month: number; day: number } {
  const match = ISO_DAY.exec(value.trim());
  if (!match) {
    throw new AsesorInputError(`"${field}" debe tener el formato AAAA-MM-DD (ej. 2026-09-01).`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AsesorInputError(`"${field}" no es una fecha valida: ${value}.`);
  }
  return { year, month, day };
}

// Rango de dias [desde, hasta] inclusivo, como semiabierto [from, to) en UTC
// (misma convencion que Balances).
export function buildDayRange(desde: string, hasta: string): DayRange {
  const start = parseIsoDay(desde, "desde");
  const end = parseIsoDay(hasta, "hasta");
  const from = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const to = new Date(Date.UTC(end.year, end.month - 1, end.day + 1));
  if (to <= from) {
    throw new AsesorInputError('"hasta" debe ser igual o posterior a "desde".');
  }
  return { from, to };
}

export function buildMonthRange(mes: number, anio: number): DayRange {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new AsesorInputError('"mes" debe ser un numero entre 1 y 12.');
  }
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    throw new AsesorInputError('"anio" debe ser un año valido (ej. 2026).');
  }
  return {
    from: new Date(Date.UTC(anio, mes - 1, 1)),
    to: new Date(Date.UTC(anio, mes, 1)),
  };
}

// Mes en curso segun la hora de Colombia (UTC-5).
export function currentMonthInBogota(now: Date = new Date()): { mes: number; anio: number } {
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return { mes: bogota.getUTCMonth() + 1, anio: bogota.getUTCFullYear() };
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function describeRange(range: DayRange): { desde: string; hasta: string } {
  return { desde: formatDay(range.from), hasta: formatDay(new Date(range.to.getTime() - 1)) };
}

export function percentage(part: number, whole: number): number {
  return whole > 0 ? roundMoney((part / whole) * 100) : 0;
}

// --- Resumen del mes ----------------------------------------------------------

// Reutiliza las metricas de Balances. Contribucion = ventas - producto - flete,
// que es exactamente la ganancia neta que calcula Balances por venta.
export function summarizeMonth(metrics: DashboardMetrics) {
  return {
    pedidos: metrics.salesCount,
    ingresos: roundMoney(metrics.salesTotal),
    costo_producto: roundMoney(metrics.supplierCosts),
    fletes: roundMoney(metrics.shippingCosts),
    contribucion: roundMoney(metrics.netProfit),
    contribucion_pct: roundMoney(metrics.marginPercentage),
    ticket_promedio: metrics.salesCount > 0 ? roundMoney(metrics.salesTotal / metrics.salesCount) : 0,
  };
}

// --- Cotizaciones -------------------------------------------------------------

export const QUOTE_STATUS_LABELS: Record<QuoteStatusCode, string> = {
  DRAFT: "Revisión",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  EXPIRED: "Expirada",
};

export const QUOTE_STATUS_FILTERS = {
  todas: null,
  revision: ["DRAFT"],
  enviada: ["SENT"],
  aceptada: ["ACCEPTED"],
  rechazada: ["REJECTED"],
  expirada: ["EXPIRED"],
} as const satisfies Record<string, readonly QuoteStatusCode[] | null>;

export type QuoteStatusFilter = keyof typeof QUOTE_STATUS_FILTERS;

// Aprobada = se convirtio en venta (al convertir, el sistema la marca "Aceptada").
export function isQuoteApproved(quote: Pick<QuoteRow, "status" | "saleCode">): boolean {
  return Boolean(quote.saleCode) || quote.status === "ACCEPTED";
}

export function summarizeQuotes(quotes: QuoteRow[]) {
  const approved = quotes.filter(isQuoteApproved);
  const totalValue = quotes.reduce((sum, quote) => sum + quote.total, 0);
  const approvedValue = approved.reduce((sum, quote) => sum + quote.total, 0);
  const byStatus: Record<string, number> = {};
  for (const quote of quotes) {
    const label = QUOTE_STATUS_LABELS[quote.status];
    byStatus[label] = (byStatus[label] ?? 0) + 1;
  }
  return {
    hechas: quotes.length,
    aprobadas: approved.length,
    pct_cierre: percentage(approved.length, quotes.length),
    valor_cotizado: roundMoney(totalValue),
    valor_aprobado: roundMoney(approvedValue),
    por_estado: byStatus,
  };
}

// --- Productos ----------------------------------------------------------------

// Margen real restando el flete por unidad (additionalCost). Reutiliza las
// mismas formulas de precio/margen del catalogo (src/lib/pricing.ts).
export function productMargin(product: ProductRow) {
  const totalCost = roundMoney(product.baseCost + product.additionalCost);
  const unitProfit = calculateProfit(totalCost, product.price);
  return {
    costo_total: totalCost,
    ganancia_unitaria: unitProfit,
    margen_sobre_precio_pct: percentage(unitProfit, product.price),
    margen_sobre_costo_pct: calculateMarginPctFromPrice(totalCost, product.price),
  };
}

// --- Comisiones ---------------------------------------------------------------

export const COMMISSION_FIRST_SALE_RATE = 0.1;
export const COMMISSION_NEXT_SALES_RATE = 0.15;
export const UNASSIGNED_SELLER = "sin asignar";

type CommissionLine = {
  venta: string;
  fecha_entrega: string;
  numero_en_el_mes: number;
  ganancia: number;
  tasa_pct: number;
  comision: number;
  nota?: string;
};

// Regla: 10% de la ganancia en la PRIMERA venta del mes de cada vendedora y 15%
// de la segunda en adelante. El orden es por fecha de entrega (mes de
// reconocimiento, igual que Balances). Una venta con ganancia <= 0 cuenta en el
// orden pero no genera comision. Las ventas sin vendedora no generan comision.
export function computeCommissions(sales: CommissionSaleInput[]) {
  const bySeller = new Map<string, { name: string; sales: CommissionSaleInput[] }>();
  const unassigned: CommissionSaleInput[] = [];

  for (const sale of sales) {
    if (!sale.seller) {
      unassigned.push(sale);
      continue;
    }
    const group = bySeller.get(sale.seller.id) ?? { name: sale.seller.name, sales: [] };
    group.sales.push(sale);
    bySeller.set(sale.seller.id, group);
  }

  const sortSales = (list: CommissionSaleInput[]) =>
    [...list].sort(
      (left, right) =>
        left.deliveredAt.getTime() - right.deliveredAt.getTime() || left.saleCode.localeCompare(right.saleCode),
    );

  const sellers = Array.from(bySeller.values())
    .map((group) => {
      const lines: CommissionLine[] = sortSales(group.sales).map((sale, index) => {
        const rate = index === 0 ? COMMISSION_FIRST_SALE_RATE : COMMISSION_NEXT_SALES_RATE;
        const base = sale.profit > 0 ? sale.profit : 0;
        const line: CommissionLine = {
          venta: sale.saleCode,
          fecha_entrega: formatDay(sale.deliveredAt),
          numero_en_el_mes: index + 1,
          ganancia: roundMoney(sale.profit),
          tasa_pct: rate * 100,
          comision: roundMoney(base * rate),
        };
        if (sale.profit <= 0) {
          line.nota = "Ganancia cero o negativa: no genera comision.";
        }
        return line;
      });
      return {
        vendedora: group.name,
        ventas: lines.length,
        ganancia_total: roundMoney(lines.reduce((sum, line) => sum + line.ganancia, 0)),
        comision_total: roundMoney(lines.reduce((sum, line) => sum + line.comision, 0)),
        detalle: lines,
      };
    })
    .sort((left, right) => right.comision_total - left.comision_total);

  const unassignedLines = sortSales(unassigned).map((sale) => ({
    venta: sale.saleCode,
    fecha_entrega: formatDay(sale.deliveredAt),
    ganancia: roundMoney(sale.profit),
  }));

  return {
    vendedoras: sellers,
    sin_asignar:
      unassignedLines.length > 0
        ? {
            vendedora: UNASSIGNED_SELLER,
            ventas: unassignedLines.length,
            ganancia_total: roundMoney(unassignedLines.reduce((sum, line) => sum + line.ganancia, 0)),
            aviso: "Estas ventas no tienen vendedora identificable; no se les calculo comision.",
            detalle: unassignedLines,
          }
        : null,
    totales: {
      ventas: sales.length,
      ganancia_total: roundMoney(sales.reduce((sum, sale) => sum + sale.profit, 0)),
      comision_total: roundMoney(sellers.reduce((sum, seller) => sum + seller.comision_total, 0)),
    },
  };
}
