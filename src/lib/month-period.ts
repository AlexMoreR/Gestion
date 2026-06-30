import type { DateRange } from "@/modules/balances/domain/entities";

export type ResolvedMonth = {
  period: DateRange;
  value: string; // "YYYY-MM"
  label: string; // "junio de 2026"
  year: number;
  month: number; // 1-12
};

// Resuelve un mes solicitado (YYYY-MM) o el mes en curso por defecto, y devuelve
// el rango semiabierto [from, to) en UTC junto con el valor y la etiqueta.
//
// Limites en UTC: las fechas de gasto/pago se guardan como medianoche UTC, asi
// que un movimiento del dia 1 cae dentro de su mes y no del anterior. Es la misma
// convencion que usa la pagina de Balances.
export function resolveMonthPeriod(monthParam?: string): ResolvedMonth {
  const now = new Date();
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();

  if (typeof monthParam === "string" && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [parsedYear, parsedMonth] = monthParam.split("-").map(Number);
    if (parsedMonth >= 1 && parsedMonth <= 12) {
      year = parsedYear;
      monthIndex = parsedMonth - 1;
    }
  }

  const from = new Date(Date.UTC(year, monthIndex, 1));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1));
  const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const label = from.toLocaleDateString("es", { month: "long", year: "numeric", timeZone: "UTC" });

  return { period: { from, to }, value, label, year, month: monthIndex + 1 };
}
