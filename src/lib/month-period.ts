import type { DateRange } from "@/modules/balances/domain/entities";
import { colombiaMonthRange, todayInColombia } from "@/lib/colombia-time";

export type ResolvedMonth = {
  period: DateRange;
  value: string; // "YYYY-MM"
  label: string; // "junio de 2026"
  year: number;
  month: number; // 1-12
};

// Resuelve un mes solicitado (YYYY-MM) o el mes en curso en Colombia por defecto, y
// devuelve el rango semiabierto [from, to) de 00:00 Colombia (05:00Z) del dia 1 a la
// medianoche del mes siguiente, junto con el valor y la etiqueta.
export function resolveMonthPeriod(monthParam?: string): ResolvedMonth {
  let value = todayInColombia().slice(0, 7);
  if (typeof monthParam === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
    value = monthParam;
  }

  const [year, month] = value.split("-").map(Number);
  const { start: from, end: to } = colombiaMonthRange(value);
  const label = from.toLocaleDateString("es", { month: "long", year: "numeric", timeZone: "America/Bogota" });

  return { period: { from, to }, value, label, year, month };
}
