import {
  computeAge,
  filterTeam,
  isAssignable,
  teamStatus,
  type TeamFilter,
  type TeamMember,
  type TeamStatus,
} from "../domain/team-member";
import type { TeamMemberInput, TeamRepository } from "../infrastructure/prisma-team-repository";

export class TeamInputError extends Error {}

export type TeamBoardMember = TeamMember & { status: TeamStatus; age: number | null; userLabel: string | null };

export type TeamBoard = {
  members: TeamBoardMember[];
  counts: { activos: number; retirados: number; todos: number };
  staffUsers: { id: string; label: string; linkedTo: string | null }[];
};

// Pantalla Equipo: fichas filtradas con su estado y edad calculados, y los usuarios del equipo
// para unir una ficha con su acceso a Gestion.
export async function getTeamBoardUseCase(repository: TeamRepository, filter: TeamFilter, today: string): Promise<TeamBoard> {
  await repository.ensureSeed();
  const [members, staff] = await Promise.all([repository.list(), repository.listStaffUsers()]);
  const labelById = new Map(staff.map((user) => [user.id, user.name?.trim() || user.email]));
  const linkedBy = new Map(members.filter((member) => member.userId).map((member) => [member.userId as string, member.fullName]));
  const retirados = members.filter((member) => teamStatus(member, today) === "RETIRADO").length;
  return {
    members: filterTeam(members, filter, today).map((member) => ({
      ...member,
      status: teamStatus(member, today),
      age: computeAge(member.birthDate, today),
      userLabel: member.userId ? (labelById.get(member.userId) ?? "Usuario sin rol de equipo") : null,
    })),
    counts: { activos: members.length - retirados, retirados, todos: members.length },
    staffUsers: staff.map((user) => ({
      id: user.id,
      label: user.name?.trim() || user.email,
      linkedTo: linkedBy.get(user.id) ?? null,
    })),
  };
}

function checkDates(input: TeamMemberInput, today: string) {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new TeamInputError("La fecha de salida no puede ser anterior a la de ingreso.");
  }
  if (input.birthDate && input.birthDate > today) {
    throw new TeamInputError("La fecha de nacimiento no puede ser futura.");
  }
}

async function checkUserLink(repository: TeamRepository, userId: string | null, memberId: string | null) {
  if (!userId) return;
  const staff = await repository.listStaffUsers();
  if (!staff.some((user) => user.id === userId)) {
    throw new TeamInputError("El usuario elegido no es del equipo (rol Admin o Empleado).");
  }
  const other = await repository.findByUserId(userId);
  if (other && other.id !== memberId) {
    throw new TeamInputError(`Ese usuario ya está unido a la ficha de ${other.fullName}.`);
  }
}

export async function saveTeamMemberUseCase(
  repository: TeamRepository,
  memberId: string | null,
  input: TeamMemberInput,
  today: string,
): Promise<TeamMember> {
  checkDates(input, today);
  await checkUserLink(repository, input.userId, memberId);
  if (!memberId) return repository.create(input);
  const current = await repository.findById(memberId);
  if (!current) throw new TeamInputError("No se encontró la ficha.");
  return repository.update(memberId, input);
}

// Dar de baja (fecha de salida + motivo) o reactivar (endDate = null quita la salida y el motivo).
export async function setTeamExitUseCase(
  repository: TeamRepository,
  memberId: string,
  endDate: string | null,
  exitReason: string | null,
): Promise<TeamMember> {
  const current = await repository.findById(memberId);
  if (!current) throw new TeamInputError("No se encontró la ficha.");
  if (endDate && current.startDate && endDate < current.startDate) {
    throw new TeamInputError("La fecha de salida no puede ser anterior a la de ingreso.");
  }
  return repository.setExit(memberId, endDate, endDate ? exitReason : null);
}

// Usuarios retirados a la fecha (para la etiqueta "Retirado/a" y para sacarlos de las asignaciones).
export function retiredUserIds(members: TeamMember[], today: string): Set<string> {
  return new Set(
    members.filter((member) => member.userId && !isAssignable(member, today)).map((member) => member.userId as string),
  );
}
