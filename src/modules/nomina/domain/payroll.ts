import { roundMoney } from "../../../lib/pricing";

// Nomina de Magilus: salario base de cada persona + comisiones del mes.
//
// Reglas (decision de Alexander, 15-oct-2026):
// - Cada persona tiene un salario base que puede ser QUINCENAL (se paga cada quincena),
//   DIARIO (tarifa por dia trabajado) o SIN_BASE (solo comision).
// - La base puede estar en COP o en USD; si esta en USD se convierte con la TRM que
//   el dueno escribe en la pantalla (nunca se inventa una tasa).
// - La comision del mes sale de la regla de Comisiones (10% primera venta, 15% desde la segunda).
// - Lo pagado son los gastos de la categoria Nomina con ese empleado en el mes.
// - Pendiente = (base del mes + comision del mes) - pagado en el mes.

export const PAY_PERIODS = ["QUINCENAL", "DIARIO", "SIN_BASE"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export const PAY_CURRENCIES = ["COP", "USD"] as const;
export type PayCurrency = (typeof PAY_CURRENCIES)[number];

export const PAY_PERIOD_LABELS: Record<PayPeriod, string> = {
  QUINCENAL: "Por quincena",
  DIARIO: "Por día trabajado",
  SIN_BASE: "Sin básico (solo comisión)",
};

export type PayrollPersonConfig = {
  userId: string;
  baseAmount: number; // por quincena (QUINCENAL) o por dia (DIARIO); 0 en SIN_BASE
  currency: PayCurrency;
  period: PayPeriod;
  earnsCommission: boolean;
  // Comision fija pactada (% de la ganancia de cada venta) en vez de la regla 10/15.
  // null = regla general. Aplica desde `commissionFrom` ("AAAA-MM") en adelante.
  commissionPct: number | null;
  commissionFrom: string | null;
};

export type PayrollConfig = {
  // COP por 1 USD. null = no se ha escrito; las bases en USD quedan sin calcular.
  trm: number | null;
  people: PayrollPersonConfig[];
  // Dias trabajados de las personas con base DIARIO, por mes "AAAA-MM" y userId.
  daysByMonth: Record<string, Record<string, number>>;
};

export const EMPTY_PAYROLL_CONFIG: PayrollConfig = { trm: null, people: [], daysByMonth: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validPct(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : null;
}

// Lee la configuracion guardada (JSON en AppSetting). Tolera datos viejos o rotos:
// lo que no se entiende se descarta en vez de romper la pantalla.
export function parsePayrollConfig(raw: string | null | undefined): PayrollConfig {
  if (!raw) return { ...EMPTY_PAYROLL_CONFIG, people: [], daysByMonth: {} };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...EMPTY_PAYROLL_CONFIG, people: [], daysByMonth: {} };
  }
  if (!isRecord(data)) return { ...EMPTY_PAYROLL_CONFIG, people: [], daysByMonth: {} };

  const people: PayrollPersonConfig[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(data.people) ? data.people : []) {
    if (!isRecord(item) || typeof item.userId !== "string" || !item.userId || seen.has(item.userId)) continue;
    const period = PAY_PERIODS.includes(item.period as PayPeriod) ? (item.period as PayPeriod) : "SIN_BASE";
    const currency = PAY_CURRENCIES.includes(item.currency as PayCurrency) ? (item.currency as PayCurrency) : "COP";
    people.push({
      userId: item.userId,
      baseAmount: period === "SIN_BASE" ? 0 : positiveNumber(item.baseAmount) ?? 0,
      currency,
      period,
      earnsCommission: item.earnsCommission !== false,
      commissionPct: validPct(item.commissionPct),
      commissionFrom: typeof item.commissionFrom === "string" && /^\d{4}-\d{2}$/.test(item.commissionFrom) ? item.commissionFrom : null,
    });
    seen.add(item.userId);
  }

  const daysByMonth: Record<string, Record<string, number>> = {};
  if (isRecord(data.daysByMonth)) {
    for (const [month, byUser] of Object.entries(data.daysByMonth)) {
      if (!/^\d{4}-\d{2}$/.test(month) || !isRecord(byUser)) continue;
      const clean: Record<string, number> = {};
      for (const [userId, days] of Object.entries(byUser)) {
        const value = typeof days === "number" ? days : Number(days);
        if (Number.isFinite(value) && value >= 0 && value <= 31) clean[userId] = value;
      }
      daysByMonth[month] = clean;
    }
  }

  return { trm: positiveNumber(data.trm), people, daysByMonth };
}

export function monthKey(mes: number, anio: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

// Tasas de comision fija vigentes en el mes (id -> tasa 0..1), para el calculo de comisiones.
export function fixedCommissionRates(config: PayrollConfig, mes: number, anio: number): Record<string, number> {
  const month = monthKey(mes, anio);
  const rates: Record<string, number> = {};
  for (const person of config.people) {
    if (person.commissionPct === null) continue;
    if (person.commissionFrom && month < person.commissionFrom) continue;
    rates[person.userId] = person.commissionPct / 100;
  }
  return rates;
}

// Base del mes en la moneda original de la persona y en COP (null si falta la TRM o los dias).
export function computeMonthlyBase(
  person: PayrollPersonConfig,
  trm: number | null,
  daysWorked: number | null,
): { units: number | null; original: number | null; cop: number | null; missing: "trm" | "dias" | null } {
  if (person.period === "SIN_BASE" || person.baseAmount <= 0) {
    return { units: 0, original: 0, cop: 0, missing: null };
  }
  const units = person.period === "QUINCENAL" ? 2 : daysWorked;
  if (units === null) {
    return { units: null, original: null, cop: null, missing: "dias" };
  }
  const original = roundMoney(person.baseAmount * units);
  if (person.currency === "USD") {
    if (!trm) return { units, original, cop: null, missing: "trm" };
    return { units, original, cop: Math.round(original * trm), missing: null };
  }
  return { units, original, cop: Math.round(original), missing: null };
}

export type PayrollPayment = {
  id: string;
  employeeId: string;
  amount: number;
  date: Date;
  description: string | null;
  accountName: string;
};

export type PayrollStaffMember = { id: string; name: string };

export type PayrollRow = {
  userId: string;
  name: string;
  configured: boolean;
  period: PayPeriod | null;
  currency: PayCurrency | null;
  baseAmount: number;
  daysWorked: number | null;
  baseUnits: number | null;
  baseOriginal: number | null;
  baseCop: number | null;
  earnsCommission: boolean;
  commissionPct: number | null;
  commissionFrom: string | null;
  salesCount: number;
  commission: number;
  totalDue: number | null; // null si la base no se pudo calcular
  paid: number;
  pending: number | null;
  payments: PayrollPayment[];
  warnings: string[];
};

export type PayrollBoard = {
  mes: number;
  anio: number;
  trm: number | null;
  rows: PayrollRow[];
  totals: { base: number; commission: number; due: number; paid: number; pending: number; incomplete: boolean };
};

export function buildPayrollBoard(input: {
  mes: number;
  anio: number;
  config: PayrollConfig;
  staff: PayrollStaffMember[];
  commissions: { userId: string; name: string; salesCount: number; commission: number }[];
  payments: PayrollPayment[];
}): PayrollBoard {
  const { config } = input;
  const nameById = new Map(input.staff.map((member) => [member.id, member.name]));
  const commissionById = new Map(input.commissions.map((row) => [row.userId, row]));
  const paymentsById = new Map<string, PayrollPayment[]>();
  for (const payment of input.payments) {
    const list = paymentsById.get(payment.employeeId) ?? [];
    list.push(payment);
    paymentsById.set(payment.employeeId, list);
  }
  const days = config.daysByMonth[monthKey(input.mes, input.anio)] ?? {};

  // Personas: las configuradas + quien tenga comision o pagos de nomina en el mes.
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };
  config.people.forEach((person) => add(person.userId));
  input.commissions.forEach((row) => add(row.userId));
  input.payments.forEach((payment) => add(payment.employeeId));

  const rows = ids.map((userId): PayrollRow => {
    const person = config.people.find((item) => item.userId === userId) ?? null;
    const commissionRow = commissionById.get(userId);
    const payments = (paymentsById.get(userId) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
    const paid = Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0));
    const warnings: string[] = [];

    const earnsCommission = person ? person.earnsCommission : true;
    const commission = earnsCommission ? Math.round(commissionRow?.commission ?? 0) : 0;
    if (!earnsCommission && (commissionRow?.commission ?? 0) > 0) {
      warnings.push("Tiene ventas con comisión pero está marcada como 'no gana comisión'.");
    }

    const daysWorked = person?.period === "DIARIO" ? (days[userId] ?? null) : null;
    const base = person ? computeMonthlyBase(person, config.trm, daysWorked) : { units: 0, original: 0, cop: 0, missing: null };
    if (!person) warnings.push("Sin salario configurado: solo se cuenta la comisión.");
    if (base.missing === "trm") warnings.push("Falta la TRM (dólar) para pasar el básico a pesos.");
    if (base.missing === "dias") warnings.push("Faltan los días trabajados del mes.");

    const totalDue = base.cop === null ? null : base.cop + commission;
    return {
      userId,
      name: nameById.get(userId) ?? commissionRow?.name ?? "Usuario sin nombre",
      configured: Boolean(person),
      period: person?.period ?? null,
      currency: person?.currency ?? null,
      baseAmount: person?.baseAmount ?? 0,
      daysWorked,
      baseUnits: base.units,
      baseOriginal: base.original,
      baseCop: base.cop,
      earnsCommission,
      commissionPct: person?.commissionPct ?? null,
      commissionFrom: person?.commissionFrom ?? null,
      salesCount: commissionRow?.salesCount ?? 0,
      commission,
      totalDue,
      paid,
      pending: totalDue === null ? null : totalDue - paid,
      payments,
      warnings,
    };
  });

  const incomplete = rows.some((row) => row.totalDue === null);
  return {
    mes: input.mes,
    anio: input.anio,
    trm: config.trm,
    rows,
    totals: {
      base: rows.reduce((sum, row) => sum + (row.baseCop ?? 0), 0),
      commission: rows.reduce((sum, row) => sum + row.commission, 0),
      due: rows.reduce((sum, row) => sum + (row.totalDue ?? 0), 0),
      paid: rows.reduce((sum, row) => sum + row.paid, 0),
      pending: rows.reduce((sum, row) => sum + Math.max(row.pending ?? 0, 0), 0),
      incomplete,
    },
  };
}

// Un pago de nomina pertenece al mes que dice su descripcion ("... · 2026-09"), aunque se
// haya pagado despues (ej. las comisiones de septiembre pagadas el 3 de octubre). Si no
// trae mes (gastos de nomina cargados a mano en Gastos), cuenta en el mes de su fecha.
const PAYROLL_MONTH_TAG = /· (\d{4}-\d{2})\b/;

export function payrollMonthTag(month: string): string {
  return `· ${month}`;
}

export function belongsToPayrollMonth(
  description: string | null,
  date: Date,
  month: string,
  period: { from: Date; to: Date },
): boolean {
  const tagged = description?.match(PAYROLL_MONTH_TAG)?.[1];
  if (tagged) return tagged === month;
  return date >= period.from && date < period.to;
}

export function isPayrollCategoryName(name: string): boolean {
  return /n[oó]mina/i.test(name);
}
