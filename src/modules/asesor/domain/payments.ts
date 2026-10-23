// Abonos y saldo de cada venta para el asesor de IA. Reglas puras, sin Prisma.
// Imports relativos (Vitest no resuelve el alias "@/").
import { roundMoney } from "../../../lib/pricing";
import { computeFullyPaidAt } from "../../balances/domain/recognition";

// Tolerancia de centavos al comparar lo pagado contra el total (igual que Balances).
const MONEY_TOLERANCE = 0.5;

export type LedgerPaymentInput = {
  amount: number;
  // Fecha que escribio la persona en el abono (null = no la escribio).
  paymentDate: Date | null;
  // Cuando se registro de verdad en el sistema.
  registeredAt: Date;
  accountName: string | null;
  method: string | null;
  note: string | null;
  // Retencion en la fuente: cuenta como pagado, pero no entra a ninguna cuenta.
  isWithholding?: boolean;
  withholdingCertificate?: string | null;
};

export type SaleLedgerInput = {
  saleId: string;
  saleCode: string;
  quoteCode: string | null;
  quoteCreatedAt: Date | null;
  saleCreatedAt: Date;
  clientName: string | null;
  sellerName: string | null;
  // Estado de la venta (SaleStatus) y de su orden (OrderStatus); null = sin orden.
  saleStatus: string;
  orderStatus: string | null;
  // ANTICIPO_50_50 / CONTRAENTREGA / null (sin definir).
  paymentMethod: string | null;
  total: number;
  // Lo pagado guardado en la venta (downPaymentAmount). En ventas viejas puede ser
  // mayor que la suma de los abonos: la diferencia se toma como pagada al crear la venta.
  recordedPaid: number;
  deliveredAt: Date | null;
  payments: LedgerPaymentInput[];
};

export type LedgerPayment = {
  amount: number;
  // Fecha que decide el mes del abono: la escrita, o la de registro si no se escribio.
  date: Date;
  registeredAt: Date | null;
  accountName: string | null;
  method: string | null;
  note: string | null;
  // La fecha escrita es de un dia anterior al dia en que se registro.
  retroactive: boolean;
  // La fecha del abono es anterior a la fecha de la cotizacion (casi siempre un error).
  beforeQuote: boolean;
  // Pagado guardado en la venta sin abono detallado (ventas viejas).
  legacy: boolean;
  isFirst: boolean;
  isWithholding: boolean;
  withholdingCertificate: string | null;
};

export type SaleLedger = {
  input: SaleLedgerInput;
  payments: LedgerPayment[];
  paid: number;
  balance: number;
  firstPaymentAt: Date | null;
  fullyPaidAt: Date | null;
  cancelled: boolean;
  // Cuenta en Balances (pagada completa; contraentrega: entregada). Mismo criterio de Balances.
  countsInBalances: boolean;
};

// Dia calendario en Colombia (UTC-5), formato AAAA-MM-DD.
export function bogotaDay(date: Date): string {
  return new Date(date.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildSaleLedger(input: SaleLedgerInput): SaleLedger {
  const quoteDay = input.quoteCreatedAt ? bogotaDay(input.quoteCreatedAt) : null;

  const detailed: LedgerPayment[] = input.payments.map((payment) => {
    const date = payment.paymentDate ?? payment.registeredAt;
    return {
      amount: payment.amount,
      date,
      registeredAt: payment.registeredAt,
      accountName: payment.accountName,
      method: payment.method,
      note: payment.note,
      retroactive: payment.paymentDate !== null && bogotaDay(payment.paymentDate) < bogotaDay(payment.registeredAt),
      beforeQuote: quoteDay !== null && bogotaDay(date) < quoteDay,
      legacy: false,
      isFirst: false,
      isWithholding: payment.isWithholding ?? false,
      withholdingCertificate: payment.isWithholding ? (payment.withholdingCertificate ?? null) : null,
    };
  });

  const detailedSum = detailed.reduce((sum, payment) => sum + payment.amount, 0);
  const legacyAmount = input.recordedPaid - detailedSum;
  if (legacyAmount > MONEY_TOLERANCE) {
    detailed.push({
      amount: legacyAmount,
      date: input.saleCreatedAt,
      registeredAt: null,
      accountName: null,
      method: null,
      note: "Pagado guardado en la venta sin abono detallado (venta antigua)",
      retroactive: false,
      beforeQuote: quoteDay !== null && bogotaDay(input.saleCreatedAt) < quoteDay,
      legacy: true,
      isFirst: false,
      isWithholding: false,
      withholdingCertificate: null,
    });
  }

  const payments = detailed
    .filter((payment) => payment.amount > 0)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  if (payments[0]) {
    payments[0].isFirst = true;
  }

  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(input.total - paid, 0);
  const fullyPaidAt = computeFullyPaidAt({
    total: input.total,
    recordedPaid: input.recordedPaid,
    saleCreatedAt: input.saleCreatedAt,
    payments: input.payments.map((payment) => ({
      amount: payment.amount,
      date: payment.paymentDate ?? payment.registeredAt,
    })),
  });

  const cancelled = input.saleStatus === "CANCELLED" || input.orderStatus === "CANCELLED";
  const delivered = input.orderStatus === "COMPLETED";
  const countsInBalances =
    !cancelled && fullyPaidAt !== null && (input.paymentMethod !== "CONTRAENTREGA" || delivered);

  return {
    input,
    payments,
    paid: roundMoney(paid),
    balance: roundMoney(balance),
    firstPaymentAt: payments[0]?.date ?? null,
    fullyPaidAt,
    cancelled,
    countsInBalances,
  };
}

export type PaymentStatusFilter = "pagadas" | "pendientes" | "todas";

// "pendientes" = no cancelada y todavia no cuenta en Balances (falta plata, o contraentrega sin entregar).
export function matchesPaymentStatus(ledger: SaleLedger, filter: PaymentStatusFilter): boolean {
  if (ledger.cancelled) return false;
  if (filter === "todas") return true;
  return filter === "pagadas" ? ledger.countsInBalances : !ledger.countsInBalances;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Coincidencia parcial sin tildes ni mayusculas ("ingrid" encuentra "Ingrid Sanchez").
export function matchesText(value: string | null | undefined, search: string | undefined): boolean {
  if (!search || !search.trim()) return true;
  return normalize(value).includes(normalize(search));
}

// Campos de abonos y saldo que se agregan a ventas, cotizaciones y ver_venta.
export function describeLedgerDates(ledger: SaleLedger) {
  return {
    fecha_cotizacion: ledger.input.quoteCreatedAt ? bogotaDay(ledger.input.quoteCreatedAt) : null,
    fecha_creacion_venta: bogotaDay(ledger.input.saleCreatedAt),
    fecha_primer_abono: ledger.firstPaymentAt ? bogotaDay(ledger.firstPaymentAt) : null,
    fecha_pago_completo: ledger.fullyPaidAt ? bogotaDay(ledger.fullyPaidAt) : null,
    fecha_entrega: ledger.input.deliveredAt ? bogotaDay(ledger.input.deliveredAt) : null,
    forma_de_pago: paymentMethodLabel(ledger.input.paymentMethod),
    pagado: ledger.paid,
    saldo_pendiente: ledger.balance,
    cancelada: ledger.cancelled,
    cuenta_en_balances: ledger.countsInBalances,
  };
}

export function describePayment(payment: LedgerPayment) {
  return {
    fecha_abono: bogotaDay(payment.date),
    registrado_el: payment.registeredAt ? bogotaDay(payment.registeredAt) : null,
    valor: roundMoney(payment.amount),
    cuenta: payment.accountName,
    metodo: payment.method,
    nota: payment.note,
    es_primer_abono: payment.isFirst,
    retroactivo: payment.retroactive,
    antes_de_la_cotizacion: payment.beforeQuote,
    sin_detalle: payment.legacy,
    // Retencion en la fuente: pagada a la DIAN por el cliente; no entra a ninguna cuenta.
    es_retencion: payment.isWithholding,
    certificado_retencion: payment.withholdingCertificate,
  };
}

function paymentMethodLabel(method: string | null): string {
  if (method === "CONTRAENTREGA") return "Contraentrega";
  if (method === "ANTICIPO_50_50") return "Anticipo 50/50";
  return "Sin definir";
}

// Acepta "SAL-00069", "sal-69" o "69".
export function normalizeSaleCode(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const digits = /^(?:SAL-?)?(\d+)$/.exec(trimmed);
  return digits ? `SAL-${digits[1].padStart(5, "0")}` : trimmed;
}
