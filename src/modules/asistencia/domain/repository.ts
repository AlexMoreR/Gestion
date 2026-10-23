import type { AttendanceKind, AttendanceMark, AttendanceOrigin } from "./attendance";

// Trabajador que puede marcar (usuario Empleado o Admin) con las fechas de su ficha de Equipo.
export type AttendanceStaff = {
  id: string;
  name: string;
  role: "ADMIN" | "EMPLEADO";
  startDate: string | null;
  endDate: string | null;
  // Tiene ficha en Equipo. Sin ficha (ej. un usuario admin generico) solo se lista si marca.
  hasTeamRecord: boolean;
};

export type NewAttendanceMark = {
  userId: string;
  kind: AttendanceKind;
  markedAt: Date;
  day: string;
  origin: AttendanceOrigin;
  createdById: string;
  reason: string | null;
  correctsId: string | null;
};

// Lo que decide la marca dentro del candado: recibe las marcas recientes y la hora del servidor.
export type DecideMark = (recent: AttendanceMark[], now: Date) => { kind: AttendanceKind; day: string };

export interface AsistenciaRepository {
  listStaff(): Promise<AttendanceStaff[]>;
  // Marcas (vigentes y anuladas) con dia entre fromDay y toDay inclusive.
  listMarks(filter: { fromDay: string; toDay: string; userId?: string }): Promise<AttendanceMark[]>;
  findMark(id: string): Promise<AttendanceMark | null>;
  // Marca con la hora real del servidor. Usa un candado por persona para que un doble clic
  // no cree dos entradas: `decide` ve las marcas recientes ya bloqueadas.
  markNow(input: {
    userId: string;
    createdById: string;
    origin: "PROPIA" | "ADMIN";
    decide: DecideMark;
  }): Promise<AttendanceMark>;
  // Marca escrita por un admin (correccion o marca olvidada).
  create(mark: NewAttendanceMark): Promise<AttendanceMark>;
  // Anula una marca (no la borra) y, si viene `replacement`, crea la nueva en la misma transaccion.
  voidMark(input: {
    id: string;
    voidedById: string;
    reason: string;
    replacement: NewAttendanceMark | null;
  }): Promise<{ voided: boolean; replacement: AttendanceMark | null }>;
}
