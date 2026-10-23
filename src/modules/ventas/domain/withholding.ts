// Retencion en la fuente (oct-2026). Algunas empresas no pagan el 100% de la venta: se quedan
// con una parte y la pagan a la DIAN a nombre de Magilus. Ese dinero nunca llega a una cuenta
// (banco, efectivo), pero la venta si queda pagada. Se registra como un abono especial:
// isWithholding = true, sin cuenta (accountId NULL) y con certificado opcional.
// Reglas puras: sin Prisma ni Next, para poder probarlas con Vitest.

export const WITHHOLDING_LABEL = "Retención en la fuente";

// Valor que manda el formulario de abono en el campo "accountId" cuando se escoge la retencion.
// Ningun id de cuenta (cuid) empieza por "__", asi que no choca con una cuenta real.
export const WITHHOLDING_ACCOUNT_VALUE = "__retencion_fuente__";

export const WITHHOLDING_CERTIFICATE_MAX = 80;

const BOGOTA_TIME_ZONE = "America/Bogota";

export function isWithholdingAccountValue(value: unknown): boolean {
  return typeof value === "string" && value.trim() === WITHHOLDING_ACCOUNT_VALUE;
}

// Certificado opcional: texto limpio, vacio = null. Mas largo que el tope = error.
export function parseWithholdingCertificate(
  value: unknown,
): { ok: true; certificate: string | null } | { ok: false; error: string } {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return { ok: true, certificate: null };
  if (text.length > WITHHOLDING_CERTIFICATE_MAX) {
    return {
      ok: false,
      error: `El número de certificado de retención no puede pasar de ${WITHHOLDING_CERTIFICATE_MAX} caracteres`,
    };
  }
  return { ok: true, certificate: text };
}

type PaymentLabelInput = {
  isWithholding?: boolean | null;
  withholdingCertificate?: string | null;
  paymentMethod?: string | null;
  accountName?: string | null;
};

// Como se muestra el medio de un abono: la retencion siempre dice "Retencion en la fuente"
// (con su certificado si lo tiene); los demas, el nombre de la cuenta o el medio guardado.
export function paymentMethodLabel(payment: PaymentLabelInput): string {
  if (payment.isWithholding) {
    const certificate = payment.withholdingCertificate?.trim();
    return certificate ? `${WITHHOLDING_LABEL} · Cert. ${certificate}` : WITHHOLDING_LABEL;
  }
  return payment.accountName?.trim() || payment.paymentMethod?.trim() || "Sin medio";
}

// Mes AAAA-MM de una fecha, en hora de Colombia.
export function bogotaMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

// Fecha AAAA-MM-DD en hora de Colombia.
export function bogotaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// ?mes=AAAA-MM valido; si no, el mes actual en Colombia.
export function parseWithholdingMonth(value: unknown, now: Date = new Date()): string {
  if (typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.trim())) {
    return value.trim();
  }
  return bogotaMonthKey(now);
}

// Rango [inicio, fin) del año de un mes AAAA-MM, en hora de Colombia (UTC-5, sin horario de verano).
export function withholdingYearRange(month: string): { from: Date; to: Date } {
  const year = Number(month.slice(0, 4));
  return {
    from: new Date(`${year}-01-01T00:00:00.000-05:00`),
    to: new Date(`${year + 1}-01-01T00:00:00.000-05:00`),
  };
}

// Rango [inicio, fin) del año para la fecha escrita del abono (paymentDate). Esa fecha de calendario
// se guarda como medianoche UTC (igual que en Balances), asi que el año va de 1-ene a 1-ene en UTC.
export function withholdingPaymentDateYearRange(month: string): { from: Date; to: Date } {
  const year = Number(month.slice(0, 4));
  return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
}

// Dia de la retencion como fecha estable (mediodia en Colombia) para agrupar por mes sin correrse:
// - con fecha escrita (paymentDate, medianoche UTC): ese mismo dia de calendario;
// - sin fecha escrita: el dia en Colombia del momento en que se registro (createdAt).
export function withholdingRowDate(paymentDate: Date | null, createdAt: Date): Date {
  const day = paymentDate ? paymentDate.toISOString().slice(0, 10) : bogotaDateKey(createdAt);
  return new Date(`${day}T12:00:00.000-05:00`);
}

export type WithholdingRow = {
  id: string;
  // Dia del abono ya normalizado con withholdingRowDate (la fecha escrita; si no hay, la del registro).
  date: Date;
  saleCode: string;
  clientName: string;
  clientTaxId: string | null;
  amount: number;
  certificate: string | null;
};

export type WithholdingReport = {
  month: string;
  rows: WithholdingRow[];
  monthTotal: number;
  yearTotal: number;
  // Total por mes del año (AAAA-MM -> valor), para ver la tendencia.
  byMonth: Array<{ month: string; total: number }>;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Reporte del mes: las retenciones del mes (por fecha del abono, en Colombia), total del mes y
// total del año. `rows` puede traer el año completo; aca se filtra.
export function buildWithholdingReport(month: string, rows: WithholdingRow[]): WithholdingReport {
  const year = month.slice(0, 4);
  const yearRows = rows.filter((row) => bogotaMonthKey(row.date).startsWith(`${year}-`));
  const monthRows = yearRows
    .filter((row) => bogotaMonthKey(row.date) === month)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.saleCode.localeCompare(b.saleCode));

  const totals = new Map<string, number>();
  for (const row of yearRows) {
    const key = bogotaMonthKey(row.date);
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }

  return {
    month,
    rows: monthRows,
    monthTotal: roundMoney(monthRows.reduce((sum, row) => sum + row.amount, 0)),
    yearTotal: roundMoney(yearRows.reduce((sum, row) => sum + row.amount, 0)),
    byMonth: [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => ({ month: key, total: roundMoney(total) })),
  };
}

function csvCell(value: string): string {
  // Evita que Excel interprete el texto como formula.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// CSV para el contador (separado por ";" y con BOM para que Excel en español lo abra bien).
export function withholdingsCsv(report: WithholdingReport): string {
  const header = ["Fecha", "Venta", "Cliente", "NIT/Cédula", "Valor retenido", "Certificado"];
  const lines = report.rows.map((row) =>
    [
      bogotaDateKey(row.date),
      row.saleCode,
      row.clientName,
      row.clientTaxId ?? "",
      String(roundMoney(row.amount)),
      row.certificate ?? "",
    ]
      .map(csvCell)
      .join(";"),
  );
  lines.push(["", "", "", "Total del mes", String(report.monthTotal), ""].map(csvCell).join(";"));
  // BOM escrito como escape para que no se borre sin querer.
  const bom = "﻿";
  return `${bom}${[header.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}
