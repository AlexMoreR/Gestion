// Unico lugar que decide el dia y el mes en hora de Colombia (UTC-5, sin horario de verano).
// Sin dependencias para que Vitest lo resuelva desde los modulos de dominio.

export type ColombiaRange = { start: Date; end: Date };

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isUtcMidnight(date: Date): boolean {
  return date.getTime() % DAY_MS === 0;
}

// 'AAAA-MM-DD' del dia en Colombia. Medianoche UTC exacta = fecha escrita por una persona
// (gasto, abono, movimiento): se toma ese dia tal cual. Lo demas es un momento real (o un
// mediodia escrito) y se lee en hora de Colombia.
// shortcut: un momento real exacto a las 00:00:00.000Z se lee como fecha escrita, upgrade si se guardan fechas con zona
export function colombiaDayKey(date: Date): string {
  return isUtcMidnight(date) ? utcDayKey(date) : utcDayKey(new Date(date.getTime() - OFFSET_MS));
}

export function colombiaMonthKey(date: Date): string {
  return colombiaDayKey(date).slice(0, 7);
}

// El ahora siempre es un momento real: no aplica la regla de medianoche.
export function todayInColombia(now: Date = new Date()): string {
  return utcDayKey(new Date(now.getTime() - OFFSET_MS));
}

// [00:00 Colombia (05:00Z), medianoche siguiente), con el fin excluido.
export function colombiaDayRange(dayKey: string): ColombiaRange {
  const start = new Date(`${dayKey}T05:00:00.000Z`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function colombiaMonthRange(monthKey: string): ColombiaRange {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1) + OFFSET_MS),
    end: new Date(Date.UTC(year, month, 1) + OFFSET_MS),
  };
}

export function inColombiaPeriod(date: Date, period: ColombiaRange | string): boolean {
  const range = typeof period === "string" ? colombiaMonthRange(period) : period;
  const key = colombiaDayKey(date);
  return key >= colombiaDayKey(range.start) && key < colombiaDayKey(range.end);
}

// Ventana para consultar la base: arranca 5 h antes para no dejar por fuera las fechas
// escritas a medianoche UTC. Despues se filtra con inColombiaPeriod.
export function dbWindow(range: ColombiaRange): ColombiaRange {
  return { start: new Date(range.start.getTime() - OFFSET_MS), end: range.end };
}
