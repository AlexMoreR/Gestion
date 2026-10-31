// Corte de mes en hora de Colombia (UTC-5, sin horario de verano). Funciones puras.
//
// Los rangos de mes de la app son de "dia calendario": [dia 1 00:00 UTC, dia 1 del mes siguiente).
// Asi caben las fechas escritas por el usuario (gasto, abono, movimiento), que se guardan a
// medianoche o a mediodia UTC. Una hora real (entrega, pago marcado "ahora") en cambio se corria:
// despues de las 7 p. m. de Colombia ya era el dia siguiente en UTC. Desde el 1-nov-2026 esas horas
// se pasan a la hora de Colombia antes de compararlas; los meses anteriores no cambian.

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const CORTE_BOGOTA_DESDE = new Date(Date.UTC(2026, 10, 1));

// Fecha con la que se decide el dia y el mes. Medianoche UTC exacta = fecha de calendario: se deja.
export function fechaContable(date: Date): Date {
  if (date < CORTE_BOGOTA_DESDE || date.getTime() % DAY_MS === 0) return date;
  return new Date(date.getTime() - BOGOTA_OFFSET_MS);
}

export function enPeriodo(date: Date, period: { from: Date; to: Date }): boolean {
  const contable = fechaContable(date);
  return contable >= period.from && contable < period.to;
}

// "Ahora" visto como dia de calendario de Colombia: sus getUTC* dan el año, mes y dia de Colombia.
export function ahoraBogota(now: Date = new Date()): Date {
  return new Date(now.getTime() - BOGOTA_OFFSET_MS);
}
