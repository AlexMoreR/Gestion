import { isIsoDay, todayInBogota } from "../../equipo/domain/team-member";

// Asistencia (registro de entrada y salida). Reglas puras.
//
// Reglas (plan aprobado por Alexander, oct-2026):
// - La hora de cada marca la pone el servidor (hora Colombia); el trabajador no la escribe.
// - Se pueden hacer varias entradas y salidas en el dia (ej. salir a almorzar).
// - Las marcas no se borran: una correccion "anula" la original y crea otra marcada CORRECCION.
// - Un dia cuenta como trabajado si tiene al menos una ENTRADA no anulada.
// - Una salida olvidada no inventa horas: el dia cuenta pero las horas quedan "sin salida".
// - El turno que pasa de medianoche cuenta en el dia de la entrada.

export const ATTENDANCE_KINDS = ["ENTRADA", "SALIDA"] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

export const ATTENDANCE_ORIGINS = ["PROPIA", "ADMIN", "CORRECCION"] as const;
export type AttendanceOrigin = (typeof ATTENDANCE_ORIGINS)[number];

export const ATTENDANCE_KIND_LABELS: Record<AttendanceKind, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
};

export const ATTENDANCE_ORIGIN_LABELS: Record<AttendanceOrigin, string> = {
  PROPIA: "Marcada por la persona",
  ADMIN: "Marcada por un admin",
  CORRECCION: "Corregida",
};

// Desde este mes la nomina por dia toma los dias de la asistencia. Los meses anteriores
// siguen con los dias escritos a mano (no se mezcla un mes a medias).
export const ASISTENCIA_NOMINA_DESDE = "2026-11";

// Una entrada abierta de otro dia sigue abierta (turno que pasa de medianoche) solo si se marco
// de noche (desde las 18:00) y tiene menos de estas horas. Si no, se toma como "salida olvidada"
// y la siguiente marca es ENTRADA (ej. entrada 17:00 sin salida: al otro dia toca entrada).
export const MAX_SHIFT_HOURS = 12;
export const NIGHT_SHIFT_FROM = "18:00";

// Largo minimo del motivo de una correccion (se valida tambien en el servidor).
export const MIN_REASON_LENGTH = 5;

export type AttendanceMark = {
  id: string;
  userId: string;
  kind: AttendanceKind;
  markedAt: Date;
  day: string; // "AAAA-MM-DD" en Colombia (el dia de la entrada)
  origin: AttendanceOrigin;
  createdById: string | null;
  createdByName: string | null;
  reason: string | null;
  correctsId: string | null;
  voidedAt: Date | null;
  voidedById: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  createdAt: Date;
};

export type DayStatus = "TRABAJANDO" | "SALIO" | "NO_HA_LLEGADO";

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  TRABAJANDO: "Trabajando",
  SALIO: "Salió",
  NO_HA_LLEGADO: "No ha llegado",
};

// Dia de calendario en Colombia de un instante.
export function bogotaDay(date: Date): string {
  return todayInBogota(date);
}

// Hora "HH:MM" en Colombia (UTC-5, sin horario de verano).
export function bogotaTime(date: Date): string {
  return new Date(date.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

// Instante de un dia "AAAA-MM-DD" y una hora "HH:MM" escritos en hora Colombia.
export function bogotaInstant(day: string, time: string): Date | null {
  if (!isIsoDay(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return new Date(`${day}T${time}:00-05:00`);
}

export function isActiveMark(mark: Pick<AttendanceMark, "voidedAt">): boolean {
  return mark.voidedAt === null;
}

function byTime<T extends Pick<AttendanceMark, "markedAt">>(a: T, b: T): number {
  return a.markedAt.getTime() - b.markedAt.getTime();
}

// Marcas vigentes (no anuladas) ordenadas por hora.
export function activeMarks<T extends AttendanceMark>(marks: T[]): T[] {
  return marks.filter(isActiveMark).sort(byTime);
}

export type NextMark = {
  kind: AttendanceKind;
  // Dia al que pertenece la marca (para una salida, el dia de su entrada).
  day: string;
  // Hora de la entrada abierta, si la siguiente marca es una salida.
  openSince: Date | null;
};

// Que toca marcar ahora: si la ultima marca vigente es una entrada reciente, salida; si no, entrada.
export function nextMark(marks: AttendanceMark[], now: Date = new Date()): NextMark {
  const today = bogotaDay(now);
  const last = activeMarks(marks).at(-1);
  if (last && last.kind === "ENTRADA") {
    const hoursOpen = (now.getTime() - last.markedAt.getTime()) / 3_600_000;
    const nightShift = bogotaTime(last.markedAt) >= NIGHT_SHIFT_FROM && hoursOpen < MAX_SHIFT_HOURS;
    if (last.day === today || nightShift) {
      return { kind: "SALIDA", day: last.day, openSince: last.markedAt };
    }
  }
  return { kind: "ENTRADA", day: today, openSince: null };
}

export type DaySummary = {
  day: string;
  status: DayStatus;
  firstEntry: Date | null;
  lastExit: Date | null;
  // Minutos de los pares entrada/salida cerrados. Una entrada sin salida no suma.
  minutes: number;
  // Quedo una entrada sin salida (si el dia ya paso: "salio sin marcar salida").
  openEntry: boolean;
  missingExit: boolean;
  worked: boolean;
  corrected: boolean;
  reasons: string[];
  marks: AttendanceMark[];
};

// Resumen de un dia de una persona a partir de sus marcas de ese dia.
export function summarizeDay(day: string, marks: AttendanceMark[], now: Date = new Date()): DaySummary {
  const valid = activeMarks(marks.filter((mark) => mark.day === day));
  let minutes = 0;
  let open: Date | null = null;
  let firstEntry: Date | null = null;
  let lastExit: Date | null = null;
  for (const mark of valid) {
    if (mark.kind === "ENTRADA") {
      if (!firstEntry) firstEntry = mark.markedAt;
      // Dos entradas seguidas: vale la primera (no se inventan horas).
      if (!open) open = mark.markedAt;
    } else {
      lastExit = mark.markedAt;
      if (open) {
        minutes += Math.max(0, Math.round((mark.markedAt.getTime() - open.getTime()) / 60_000));
        open = null;
      }
    }
  }
  const worked = firstEntry !== null;
  const openEntry = open !== null;
  const stillOpen = openEntry && nextMark(valid, now).kind === "SALIDA";
  const status: DayStatus = !worked ? "NO_HA_LLEGADO" : stillOpen ? "TRABAJANDO" : "SALIO";
  // Anuladas y correcciones del dia (para mostrar quien corrigio y por que).
  const touched = marks.filter((mark) => mark.day === day && (mark.origin === "CORRECCION" || mark.voidedAt !== null));
  const reasons = [
    ...new Set(
      touched.flatMap((mark) => [mark.reason, mark.voidReason]).filter((text): text is string => Boolean(text?.trim())),
    ),
  ];
  return {
    day,
    status,
    firstEntry,
    lastExit: openEntry ? null : lastExit,
    minutes,
    openEntry,
    missingExit: openEntry && !stillOpen,
    worked,
    corrected: touched.length > 0,
    reasons,
    marks: [...marks.filter((mark) => mark.day === day)].sort(byTime),
  };
}

// Dias trabajados en el mes "AAAA-MM": dias distintos con al menos una entrada vigente.
export function workedDays(marks: Pick<AttendanceMark, "kind" | "day" | "voidedAt">[], month: string): string[] {
  const days = new Set<string>();
  for (const mark of marks) {
    if (mark.kind === "ENTRADA" && mark.voidedAt === null && mark.day.startsWith(`${month}-`)) days.add(mark.day);
  }
  return [...days].sort();
}

// Dias trabajados del mes por persona (userId -> numero de dias).
export function workedDaysByUser(
  marks: Pick<AttendanceMark, "userId" | "kind" | "day" | "voidedAt">[],
  month: string,
): Record<string, number> {
  const byUser = new Map<string, Pick<AttendanceMark, "userId" | "kind" | "day" | "voidedAt">[]>();
  for (const mark of marks) {
    const list = byUser.get(mark.userId) ?? [];
    list.push(mark);
    byUser.set(mark.userId, list);
  }
  const result: Record<string, number> = {};
  for (const [userId, list] of byUser) {
    const count = workedDays(list, month).length;
    if (count > 0) result[userId] = count;
  }
  return result;
}

// Los dias del mes "AAAA-MM" hasta `today` inclusive (los dias futuros no se listan).
export function monthDays(month: string, today: string): string[] {
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days: string[] = [];
  for (let day = 1; day <= last; day += 1) {
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    if (iso > today) break;
    days.push(iso);
  }
  return days;
}

// "7 h 05 min" para mostrar; 0 -> "0 min".
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

// La nomina de este mes toma los dias de la asistencia (desde ASISTENCIA_NOMINA_DESDE).
export function attendanceDrivesPayroll(month: string): boolean {
  return month >= ASISTENCIA_NOMINA_DESDE;
}

export const MAX_REASON_LENGTH = 300;

// Validacion del motivo de una correccion: obligatorio, con algo de texto y sin pasar el maximo.
export function validReason(reason: string | null | undefined): string | null {
  const text = reason?.trim() ?? "";
  return text.length >= MIN_REASON_LENGTH && text.length <= MAX_REASON_LENGTH ? text : null;
}

// Mes "AAAA-MM" valido (mes 01..12).
export function isMonthKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}
