import { normalizePersonName, type TeamPayType } from "./team-member";

// Carga inicial del equipo (decision de Alexander, oct-2026). Se corre una sola vez, la primera
// vez que se usa el modulo. Lo que no se sabe (cedula, celular, nacimiento, ingreso de los
// demas...) queda vacio para que Alexander lo complete en /admin/equipo.
export type InitialTeamMember = {
  fullName: string;
  jobTitle: string | null;
  isOwner: boolean;
  payType: TeamPayType | null;
  startDate: string | null;
  endDate: string | null;
};

export const INITIAL_TEAM: InitialTeamMember[] = [
  { fullName: "Alexander", jobTitle: "Dueño", isOwner: true, payType: null, startDate: null, endDate: null },
  { fullName: "Ingrid Sánchez", jobTitle: "Asesora", isOwner: false, payType: null, startDate: null, endDate: null },
  { fullName: "María Camila Ardila", jobTitle: "Asesora", isOwner: false, payType: null, startDate: null, endDate: null },
  { fullName: "Emanuel Díaz", jobTitle: null, isOwner: false, payType: "DIARIO", startDate: "2026-10-15", endDate: null },
  // Motivo de salida vacio: lo escribe Alexander.
  { fullName: "Génesis", jobTitle: null, isOwner: false, payType: null, startDate: null, endDate: "2026-10-20" },
];

export type StaffUser = { id: string; name: string | null; email: string };

function tokens(value: string): string[] {
  return normalizePersonName(value).split(" ").filter(Boolean);
}

// Une una ficha con un usuario del equipo SOLO si no hay dudas: el primer nombre coincide, todas
// las palabras del nombre mas corto estan en el mas largo y ningun otro usuario cumple lo mismo.
export function matchStaffUser(fullName: string, staff: StaffUser[]): string | null {
  const wanted = tokens(fullName);
  if (wanted.length === 0) return null;
  const matches = staff.filter((user) => {
    const have = tokens(user.name ?? "");
    if (have.length === 0 || have[0] !== wanted[0]) return false;
    const [shorter, longer] = have.length <= wanted.length ? [have, wanted] : [wanted, have];
    return shorter.every((token) => longer.includes(token));
  });
  return matches.length === 1 ? matches[0].id : null;
}

export type SeedCreation = InitialTeamMember & { nameKey: string; userId: string | null };

// Que fichas crear: se salta a quien ya tenga ficha (mismo primer nombre o mismo usuario), asi
// correrla dos veces no duplica a nadie. Un usuario no se une a dos fichas.
export function planInitialTeam(
  existing: { nameKey: string; userId: string | null }[],
  staff: StaffUser[],
  initial: InitialTeamMember[] = INITIAL_TEAM,
): SeedCreation[] {
  const usedUsers = new Set(existing.map((member) => member.userId).filter((id): id is string => Boolean(id)));
  const existingFirstNames = new Set(existing.map((member) => member.nameKey.split(" ")[0]));
  const creations: SeedCreation[] = [];
  for (const person of initial) {
    const nameKey = normalizePersonName(person.fullName);
    if (existingFirstNames.has(nameKey.split(" ")[0])) continue;
    const matched = matchStaffUser(person.fullName, staff);
    const userId = matched && !usedUsers.has(matched) ? matched : null;
    if (userId) usedUsers.add(userId);
    existingFirstNames.add(nameKey.split(" ")[0]);
    creations.push({ ...person, nameKey, userId });
  }
  return creations;
}
