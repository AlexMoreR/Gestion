import { isActiveInMonth, isActiveOn, isIsoDay } from "../../equipo/domain/team-member";
import {
  bogotaDay,
  bogotaInstant,
  bogotaTime,
  isMonthKey,
  monthDays,
  nextMark,
  summarizeDay,
  validReason,
  workedDaysByUser,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  type AttendanceKind,
  type AttendanceMark,
  type DaySummary,
  type NextMark,
} from "../domain/attendance";
import type { AsistenciaRepository, AttendanceStaff, NewAttendanceMark } from "../domain/repository";

// Error con un mensaje para mostrarle a la persona (no es una falla del sistema).
export class AttendanceInputError extends Error {}

function requireReason(reason: string | null | undefined): string {
  const text = validReason(reason);
  if (!text) {
    throw new AttendanceInputError(
      `El motivo es obligatorio (entre ${MIN_REASON_LENGTH} y ${MAX_REASON_LENGTH} letras).`,
    );
  }
  return text;
}

// ---------- Marcar (hora del servidor) ----------

// `expected` es lo que decia el boton cuando la persona lo toco. Si no coincide con lo que toca
// (doble clic, o marco en otra pestaña), no se crea nada: asi no quedan dos entradas seguidas.
function decideWithExpected(expected: AttendanceKind) {
  return (recent: AttendanceMark[], now: Date) => {
    const next = nextMark(recent, now);
    if (next.kind !== expected) {
      throw new AttendanceInputError(
        next.kind === "SALIDA"
          ? `Ya está trabajando desde las ${bogotaTime(next.openSince ?? now)}. No se marcó otra entrada.`
          : "No hay una entrada abierta: no se marcó la salida.",
      );
    }
    return { kind: next.kind, day: next.day };
  };
}

// Segun su ficha de Equipo, la persona trabaja ese dia (ni retirada ni antes de su ingreso).
function requireActiveOn(person: AttendanceStaff, day: string): void {
  if (person.endDate && day > person.endDate) {
    throw new AttendanceInputError(`${person.name} salió el ${person.endDate} (ficha de Equipo): no se puede marcar asistencia.`);
  }
  if (person.startDate && day < person.startDate) {
    throw new AttendanceInputError(`${person.name} ingresa el ${person.startDate} (ficha de Equipo): no se puede marcar antes.`);
  }
}

export async function markOwnAttendanceUseCase(
  repo: AsistenciaRepository,
  userId: string,
  expected: AttendanceKind,
  now: Date = new Date(),
): Promise<AttendanceMark> {
  const person = (await repo.listStaff()).find((member) => member.id === userId);
  if (!person) throw new AttendanceInputError("Solo el equipo de trabajo marca asistencia.");
  requireActiveOn(person, bogotaDay(now));
  return repo.markNow({ userId, createdById: userId, origin: "PROPIA", decide: decideWithExpected(expected) });
}

// Un admin marca por alguien que no puede hacerlo (sin celular): igual con la hora del servidor.
export async function markForPersonUseCase(
  repo: AsistenciaRepository,
  adminId: string,
  userId: string,
  expected: AttendanceKind,
  now: Date = new Date(),
): Promise<{ mark: AttendanceMark; person: AttendanceStaff }> {
  const person = (await repo.listStaff()).find((member) => member.id === userId);
  if (!person) throw new AttendanceInputError("Esa persona no es un trabajador de Gestión.");
  requireActiveOn(person, bogotaDay(now));
  const mark = await repo.markNow({ userId, createdById: adminId, origin: "ADMIN", decide: decideWithExpected(expected) });
  return { mark, person };
}

// ---------- Correcciones (solo admin, con motivo) ----------

export type ManualMarkInput = {
  kind: AttendanceKind;
  day: string; // dia de trabajo (el de la entrada)
  time: string; // "HH:MM" hora Colombia
  // La salida fue despues de medianoche (al dia siguiente del dia de trabajo).
  nextDay: boolean;
  reason: string;
};

function manualInstant(input: ManualMarkInput, now: Date): Date {
  if (!isIsoDay(input.day)) throw new AttendanceInputError("Fecha inválida.");
  const base = bogotaInstant(input.day, input.time);
  if (!base) throw new AttendanceInputError("Hora inválida (formato HH:MM).");
  const markedAt = input.kind === "SALIDA" && input.nextDay ? new Date(base.getTime() + 24 * 60 * 60 * 1000) : base;
  // Una correccion no puede quedar en el futuro (un minuto de gracia por relojes).
  if (markedAt.getTime() > now.getTime() + 60_000) throw new AttendanceInputError("La hora no puede ser futura.");
  return markedAt;
}

async function requireStaff(repo: AsistenciaRepository, userId: string): Promise<AttendanceStaff> {
  const person = (await repo.listStaff()).find((member) => member.id === userId);
  if (!person) throw new AttendanceInputError("Esa persona no es un trabajador de Gestión.");
  return person;
}

// Agrega una marca olvidada. Queda con origen CORRECCION, quien la agrego y el motivo.
export async function addMissingMarkUseCase(
  repo: AsistenciaRepository,
  adminId: string,
  userId: string,
  input: ManualMarkInput,
  now: Date = new Date(),
): Promise<{ mark: AttendanceMark; person: AttendanceStaff }> {
  const reason = requireReason(input.reason);
  const person = await requireStaff(repo, userId);
  const markedAt = manualInstant(input, now);
  requireActiveOn(person, input.day);
  const mark = await repo.create({
    userId,
    kind: input.kind,
    markedAt,
    day: input.day,
    origin: "CORRECCION",
    createdById: adminId,
    reason,
    correctsId: null,
  });
  return { mark, person };
}

// Corrige una marca: la original queda anulada (no se borra) y se crea la nueva CORRECCION.
export async function correctMarkUseCase(
  repo: AsistenciaRepository,
  adminId: string,
  markId: string,
  input: ManualMarkInput,
  now: Date = new Date(),
): Promise<{ original: AttendanceMark; mark: AttendanceMark }> {
  const reason = requireReason(input.reason);
  const original = await repo.findMark(markId);
  if (!original) throw new AttendanceInputError("No se encontró la marca.");
  if (original.voidedAt) throw new AttendanceInputError("Esa marca ya estaba anulada.");
  const markedAt = manualInstant(input, now);
  const replacement: NewAttendanceMark = {
    userId: original.userId,
    kind: input.kind,
    markedAt,
    day: input.day,
    origin: "CORRECCION",
    createdById: adminId,
    reason,
    correctsId: original.id,
  };
  const result = await repo.voidMark({ id: original.id, voidedById: adminId, reason, replacement });
  if (!result.voided || !result.replacement) throw new AttendanceInputError("Esa marca ya estaba anulada.");
  return { original, mark: result.replacement };
}

// Anula una marca mal hecha (ej. una entrada repetida), sin reemplazo.
export async function voidMarkUseCase(
  repo: AsistenciaRepository,
  adminId: string,
  markId: string,
  reasonText: string,
): Promise<AttendanceMark> {
  const reason = requireReason(reasonText);
  const original = await repo.findMark(markId);
  if (!original) throw new AttendanceInputError("No se encontró la marca.");
  const result = await repo.voidMark({ id: original.id, voidedById: adminId, reason, replacement: null });
  if (!result.voided) throw new AttendanceInputError("Esa marca ya estaba anulada.");
  return original;
}

// ---------- Consultas ----------

// Lo que ve cada persona en el boton de la barra.
export type MyAttendance = { next: NextMark; today: DaySummary };

export async function getMyAttendanceUseCase(
  repo: AsistenciaRepository,
  userId: string,
  now: Date = new Date(),
): Promise<MyAttendance> {
  const today = bogotaDay(now);
  const yesterday = bogotaDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const marks = await repo.listMarks({ fromDay: yesterday, toDay: today, userId });
  const next = nextMark(marks, now);
  return { next, today: summarizeDay(next.day, marks, now) };
}

export type TodayRow = { person: AttendanceStaff; summary: DaySummary };

// Se lista a la persona ese dia si tiene ficha en Equipo y trabajaba ese dia, o si marco algo
// (un usuario sin ficha, ej. un admin generico, no sale como "no ha llegado" todos los dias).
function listedOn(person: AttendanceStaff, day: string, marks: AttendanceMark[]): boolean {
  if (person.hasTeamRecord && isActiveOn(person, day)) return true;
  return marks.some((mark) => mark.userId === person.id && mark.day === day);
}

// Asistencia de hoy: cada trabajador activo hoy (segun su ficha) con su estado.
export async function getTodayBoardUseCase(
  repo: AsistenciaRepository,
  now: Date = new Date(),
): Promise<{ today: string; rows: TodayRow[] }> {
  const today = bogotaDay(now);
  const yesterday = bogotaDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const [staff, marks] = await Promise.all([repo.listStaff(), repo.listMarks({ fromDay: yesterday, toDay: today })]);
  const rows = staff
    .filter((person) => listedOn(person, today, marks))
    .map((person) => {
      const own = marks.filter((mark) => mark.userId === person.id);
      // Si sigue abierta una entrada de anoche (turno de madrugada), se muestra ese dia.
      const next = nextMark(own, now);
      const day = next.kind === "SALIDA" ? next.day : today;
      return { person, summary: summarizeDay(day, own, now) };
    });
  const order = { TRABAJANDO: 0, SALIO: 1, NO_HA_LLEGADO: 2 } as const;
  rows.sort((a, b) => order[a.summary.status] - order[b.summary.status] || a.person.name.localeCompare(b.person.name, "es"));
  return { today, rows };
}

export type PersonRange = {
  person: AttendanceStaff;
  days: DaySummary[];
  workedDays: number;
  minutes: number;
  corrections: number;
  missingExits: number;
};

function daysBetween(fromDay: string, toDay: string): string[] {
  const days: string[] = [];
  let cursor = new Date(`${fromDay}T00:00:00.000Z`);
  const end = new Date(`${toDay}T00:00:00.000Z`);
  while (cursor <= end && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

function buildPersonRange(person: AttendanceStaff, marks: AttendanceMark[], days: string[], now: Date): PersonRange {
  const own = marks.filter((mark) => mark.userId === person.id);
  const summaries = days.filter((day) => listedOn(person, day, own)).map((day) => summarizeDay(day, own, now));
  return {
    person,
    days: summaries,
    workedDays: summaries.filter((day) => day.worked).length,
    minutes: summaries.reduce((sum, day) => sum + day.minutes, 0),
    corrections: summaries.filter((day) => day.corrected).length,
    missingExits: summaries.filter((day) => day.missingExit).length,
  };
}

// Asistencia de un rango de dias (inclusive), por persona. Los dias futuros no se listan.
export async function getRangeBoardUseCase(
  repo: AsistenciaRepository,
  range: { fromDay: string; toDay: string; userId?: string },
  now: Date = new Date(),
): Promise<{ fromDay: string; toDay: string; people: PersonRange[] }> {
  if (!isIsoDay(range.fromDay) || !isIsoDay(range.toDay) || range.fromDay > range.toDay) {
    throw new AttendanceInputError("Rango de fechas inválido (AAAA-MM-DD, desde ≤ hasta).");
  }
  const today = bogotaDay(now);
  const toDay = range.toDay > today ? today : range.toDay;
  const [staff, marks] = await Promise.all([
    repo.listStaff(),
    repo.listMarks({ fromDay: range.fromDay, toDay: range.toDay, userId: range.userId }),
  ]);
  const days = range.fromDay > toDay ? [] : daysBetween(range.fromDay, toDay);
  const people = staff
    .filter((person) => !range.userId || person.id === range.userId)
    .map((person) => buildPersonRange(person, marks, days, now))
    // Solo quien trabajaba en el rango o tiene marcas en el.
    .filter((row) => row.days.length > 0 || (range.userId && row.person.id === range.userId));
  return { fromDay: range.fromDay, toDay, people };
}

// Asistencia del mes "AAAA-MM" (hasta hoy), por persona.
export async function getMonthBoardUseCase(
  repo: AsistenciaRepository,
  month: string,
  userId?: string,
  now: Date = new Date(),
): Promise<{ month: string; people: PersonRange[] }> {
  if (!isMonthKey(month)) throw new AttendanceInputError("Mes inválido (AAAA-MM).");
  const today = bogotaDay(now);
  const days = monthDays(month, today);
  if (days.length === 0) {
    const staff = (await repo.listStaff()).filter(
      (person) => (!userId || person.id === userId) && person.hasTeamRecord && isActiveInMonth(person, month),
    );
    return { month, people: staff.map((person) => ({ person, days: [], workedDays: 0, minutes: 0, corrections: 0, missingExits: 0 })) };
  }
  const board = await getRangeBoardUseCase(repo, { fromDay: days[0], toDay: days[days.length - 1], userId }, now);
  return { month, people: board.people };
}

// Dias trabajados del mes por persona (para la nomina). Cuenta todo el mes, no solo hasta hoy.
export async function getWorkedDaysByMonthUseCase(repo: AsistenciaRepository, month: string): Promise<Record<string, number>> {
  if (!isMonthKey(month)) throw new AttendanceInputError("Mes inválido (AAAA-MM).");
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const marks = await repo.listMarks({ fromDay: `${month}-01`, toDay: `${month}-${String(last).padStart(2, "0")}` });
  return workedDaysByUser(marks, month);
}
