// Fecha estimada de entrega por defecto (decision de Alexander, 7-oct-2026):
// Bogota 3 dias habiles, demas capitales de departamento 5, municipios 7.
// Dias habiles = lunes a viernes (no descuenta festivos). Siempre se puede editar a mano.

import { isDepartmentCapitalCode } from "../../transporte/domain/place-search";

export const BOGOTA_CITY_CODE = "11001";

export type DestinationTier = "BOGOTA" | "CAPITAL" | "MUNICIPIO";

export const BUSINESS_DAYS_BY_TIER: Readonly<Record<DestinationTier, number>> = {
  BOGOTA: 3,
  CAPITAL: 5,
  MUNICIPIO: 7,
};

export function destinationTier(cityCode: string | null | undefined): DestinationTier {
  if (cityCode === BOGOTA_CITY_CODE) {
    return "BOGOTA";
  }
  if (isDepartmentCapitalCode(cityCode)) {
    return "CAPITAL";
  }
  return "MUNICIPIO";
}

export function businessDaysFor(cityCode: string | null | undefined): number {
  return BUSINESS_DAYS_BY_TIER[destinationTier(cityCode)];
}

// Dia calendario (anio, mes, dia) de una fecha en hora de Colombia.
function bogotaCalendarDay(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Suma dias habiles (lun-vie) a partir del dia de Colombia de `from`. El resultado es una
// fecha "de calendario" guardada a las 12:00 UTC para que no cambie de dia al mostrarla
// (mostrar con timeZone "UTC").
export function addBusinessDays(from: Date, businessDays: number): Date {
  const { year, month, day } = bogotaCalendarDay(from);
  const cursor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  let remaining = Math.max(0, Math.floor(businessDays));
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }
  return cursor;
}

export function estimateDelivery(from: Date, destinationCityCode: string | null | undefined): Date {
  return addBusinessDays(from, businessDaysFor(destinationCityCode));
}

// "2026-10-15" (input type=date) -> fecha de calendario a las 12:00 UTC. null si no es valida.
export function parseDateInput(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

export function toDateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
