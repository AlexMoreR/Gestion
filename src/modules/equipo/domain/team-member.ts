// Ficha de trabajadores (Equipo). Reglas puras: estado, edad, "¿trabajaba en tal fecha?"
// y quien entra a la nomina de un mes. Las fechas van como texto "AAAA-MM-DD" (dia de
// calendario en Colombia), asi no se corren de dia por la zona horaria.

export const TEAM_EMPLOYMENT_TYPES = ["FREELANCE", "EMPLEADO", "OTRO"] as const;
export type TeamEmploymentType = (typeof TEAM_EMPLOYMENT_TYPES)[number];

export const TEAM_PAY_TYPES = ["QUINCENAL", "DIARIO", "SOLO_COMISION"] as const;
export type TeamPayType = (typeof TEAM_PAY_TYPES)[number];

export const TEAM_EMPLOYMENT_LABELS: Record<TeamEmploymentType, string> = {
  FREELANCE: "Freelance",
  EMPLEADO: "Empleado/a",
  OTRO: "Otro",
};

export const TEAM_PAY_LABELS: Record<TeamPayType, string> = {
  QUINCENAL: "Por quincena",
  DIARIO: "Por día",
  SOLO_COMISION: "Solo comisión",
};

export type TeamStatus = "ACTIVO" | "RETIRADO";

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  ACTIVO: "Activo/a",
  RETIRADO: "Retirado/a",
};

export type TeamMember = {
  id: string;
  userId: string | null;
  fullName: string;
  document: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  jobTitle: string | null;
  isOwner: boolean;
  employmentType: TeamEmploymentType;
  payType: TeamPayType | null;
  startDate: string | null;
  endDate: string | null;
  exitReason: string | null;
  notes: string | null;
};

// Lo que se puede contar fuera del panel (asesor de IA): sin cedula, nacimiento,
// direccion, celular, correo ni contacto de emergencia.
export type TeamMemberPublic = Pick<
  TeamMember,
  "id" | "userId" | "fullName" | "jobTitle" | "isOwner" | "employmentType" | "payType" | "startDate" | "endDate" | "exitReason"
>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string | null | undefined): value is string {
  if (!value || !ISO_DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Dia de hoy en Colombia (UTC-5, sin horario de verano).
export function todayInBogota(now: Date = new Date()): string {
  return new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Nombre sin tildes, en minusculas y con un solo espacio: para buscar y para unir con usuarios.
export function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Edad cumplida a la fecha `today` (el dia del cumpleanos ya cuenta).
export function computeAge(birthDate: string | null, today: string): number | null {
  if (!isIsoDay(birthDate) || !isIsoDay(today) || birthDate > today) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

// Retirado = ya paso su ultimo dia (fecha de salida anterior a hoy). El dia de la salida
// todavia trabaja. Sin fecha de salida siempre esta activo.
export function teamStatus(member: Pick<TeamMember, "endDate">, today: string): TeamStatus {
  return member.endDate && member.endDate < today ? "RETIRADO" : "ACTIVO";
}

// Regla unica para "¿esta persona trabajaba en tal fecha?" (base del control de asistencia):
// desde su ingreso (si no hay fecha de ingreso, desde siempre) hasta su salida, ambos inclusive.
export function isActiveOn(member: Pick<TeamMember, "startDate" | "endDate">, day: string): boolean {
  if (member.startDate && day < member.startDate) return false;
  if (member.endDate && day > member.endDate) return false;
  return true;
}

function monthBounds(month: string): { first: string; last: string } {
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(lastDay).padStart(2, "0")}` };
}

// Trabajo al menos un dia del mes "AAAA-MM".
export function isActiveInMonth(member: Pick<TeamMember, "startDate" | "endDate">, month: string): boolean {
  const { first, last } = monthBounds(month);
  if (member.startDate && member.startDate > last) return false;
  if (member.endDate && member.endDate < first) return false;
  return true;
}

// Ya habia salido antes de empezar el mes (su mes de salida es anterior).
export function leftBeforeMonth(member: Pick<TeamMember, "endDate">, month: string): boolean {
  return Boolean(member.endDate && member.endDate.slice(0, 7) < month);
}

// Personas para escoger en una asignacion (orden, produccion, gasto): sin los retirados.
export function isAssignable(member: Pick<TeamMember, "endDate"> | null | undefined, today: string): boolean {
  return !member || teamStatus(member, today) === "ACTIVO";
}

// Lo que la nomina necesita saber de cada ficha en un mes.
export type PayrollTeamEntry = {
  memberId: string;
  userId: string | null;
  name: string;
  // Trabajo algun dia del mes: entra a la nomina aunque no tenga salario ni comision.
  activeInMonth: boolean;
  // Salio antes de este mes: solo aparece si todavia tiene comision o pagos del mes.
  leftBeforeMonth: boolean;
  status: TeamStatus;
  endDate: string | null;
  payType: TeamPayType | null;
};

export function payrollTeamEntries(members: TeamMember[], month: string, today: string): PayrollTeamEntry[] {
  return members.map((member) => ({
    memberId: member.id,
    userId: member.userId,
    name: member.fullName,
    activeInMonth: isActiveInMonth(member, month),
    leftBeforeMonth: leftBeforeMonth(member, month),
    status: teamStatus(member, today),
    endDate: member.endDate,
    payType: member.payType,
  }));
}

export function toPublicMember(member: TeamMember): TeamMemberPublic {
  return {
    id: member.id,
    userId: member.userId,
    fullName: member.fullName,
    jobTitle: member.jobTitle,
    isOwner: member.isOwner,
    employmentType: member.employmentType,
    payType: member.payType,
    startDate: member.startDate,
    endDate: member.endDate,
    exitReason: member.exitReason,
  };
}

export type TeamFilter = { estado: "activos" | "retirados" | "todos"; q: string; pago: TeamPayType | "" };

export function filterTeam<T extends TeamMember>(members: T[], filter: TeamFilter, today: string): T[] {
  const query = normalizePersonName(filter.q);
  return members
    .filter((member) => {
      const status = teamStatus(member, today);
      if (filter.estado === "activos" && status !== "ACTIVO") return false;
      if (filter.estado === "retirados" && status !== "RETIRADO") return false;
      if (filter.pago && member.payType !== filter.pago) return false;
      if (query && !normalizePersonName(member.fullName).includes(query)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return a.fullName.localeCompare(b.fullName, "es");
    });
}
