import { roundMoney } from "../../../lib/pricing";
import { COMMISSION_FIRST_SALE_RATE, COMMISSION_NEXT_SALES_RATE } from "../../asesor/domain/calculations";

const FLAT_RATE = COMMISSION_FIRST_SALE_RATE === COMMISSION_NEXT_SALES_RATE;

// Link privado de cada asesora (/mis-comisiones/<token>): sus ventas del mes con la comision
// explicada, y sus cotizaciones abiertas con lo que ganaria si las cierra.
// Nunca muestra costos ni fletes: solo valor de la venta, ganancia y comision.

export type PortalSaleLine = {
  saleCode: string;
  day: string;
  clientName: string | null;
  saleAmount: number;
  profit: number;
  ratePct: number;
  commission: number;
  pendingDelivery: boolean;
  noCommission: boolean;
};

export type PortalQuoteInput = {
  quoteCode: string;
  createdAt: Date;
  clientName: string | null;
  status: string;
  total: number;
  estimatedCost: number; // costo de catalogo (producto + flete por unidad) x cantidad
  products: string[];
};

export type PortalQuoteLine = {
  quoteCode: string;
  day: string;
  clientName: string | null;
  statusLabel: string;
  total: number;
  products: string[];
  estimatedCommission: number;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "En revisión",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
};

// Tasa que tendria la PROXIMA venta: la fija pactada, o 10% si aun no tiene ventas en el mes y 15% si ya tiene.
export function nextSaleRate(salesInMonth: number, fixedRate: number | null): number {
  if (fixedRate !== null) return fixedRate;
  return salesInMonth === 0 ? COMMISSION_FIRST_SALE_RATE : COMMISSION_NEXT_SALES_RATE;
}

export function estimateQuoteCommission(total: number, estimatedCost: number, rate: number): number {
  const profit = total - estimatedCost;
  return profit > 0 ? Math.round(profit * rate) : 0;
}

export function explainSaleLine(line: PortalSaleLine, money: (value: number) => string): string {
  if (line.noCommission) return "Esta venta no dejó ganancia, así que no genera comisión.";
  return `${line.ratePct}% de ${money(line.profit)} de ganancia = ${money(line.commission)}`;
}

export function ruleText(fixedRatePct: number | null): string {
  if (fixedRatePct !== null) {
    return `Ganas el ${fixedRatePct}% de la ganancia de cada venta. La venta cuenta cuando el cliente la paga completa (contraentrega: cuando se entrega).`;
  }
  if (FLAT_RATE) {
    return `Ganas el ${COMMISSION_NEXT_SALES_RATE * 100}% de la ganancia de cada venta. La venta cuenta cuando el cliente la paga completa (contraentrega: cuando se entrega).`;
  }
  return `Ganas el ${COMMISSION_FIRST_SALE_RATE * 100}% de la ganancia de tu primera venta del mes y el ${
    COMMISSION_NEXT_SALES_RATE * 100
  }% desde la segunda. La venta cuenta cuando el cliente la paga completa (contraentrega: cuando se entrega).`;
}

export function buildPortalQuotes(quotes: PortalQuoteInput[], rate: number): PortalQuoteLine[] {
  return quotes.map((quote) => ({
    quoteCode: quote.quoteCode,
    day: quote.createdAt.toISOString().slice(0, 10),
    clientName: quote.clientName,
    statusLabel: STATUS_LABELS[quote.status] ?? quote.status,
    total: roundMoney(quote.total),
    products: quote.products,
    estimatedCommission: estimateQuoteCommission(quote.total, quote.estimatedCost, rate),
  }));
}
