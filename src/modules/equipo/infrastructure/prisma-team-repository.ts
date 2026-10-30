import type { TeamMember as TeamMemberRow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { planInitialTeam } from "../domain/seed";
import { normalizePersonName, teamStatus, todayInBogota, type TeamMember } from "../domain/team-member";

// Marca de que la carga inicial ya corrio (aunque luego se editen o den de baja las fichas,
// no se vuelve a cargar).
const TEAM_SEED_SETTING_KEY = "teamSeedDone";
// Candado de Postgres para que dos pantallas abiertas a la vez no carguen el equipo dos veces.
const TEAM_SEED_LOCK = 7300212026;

export type TeamMemberInput = Omit<TeamMember, "id">;

export type TeamRepository = {
  ensureSeed(): Promise<void>;
  list(): Promise<TeamMember[]>;
  findById(id: string): Promise<TeamMember | null>;
  findByUserId(userId: string): Promise<TeamMember | null>;
  create(input: TeamMemberInput): Promise<TeamMember>;
  update(id: string, input: TeamMemberInput): Promise<TeamMember>;
  setExit(id: string, endDate: string | null, exitReason: string | null): Promise<TeamMember>;
  listStaffUsers(): Promise<{ id: string; name: string | null; email: string }[]>;
};

// Las columnas DATE llegan como medianoche UTC: se leen como "AAAA-MM-DD" sin correrse de dia.
function toDay(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function fromDay(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toDomain(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    userId: row.userId,
    fullName: row.fullName,
    document: row.document,
    birthDate: toDay(row.birthDate),
    phone: row.phone,
    email: row.email,
    address: row.address,
    emergencyName: row.emergencyName,
    emergencyPhone: row.emergencyPhone,
    jobTitle: row.jobTitle,
    isOwner: row.isOwner,
    employmentType: row.employmentType,
    payType: row.payType,
    startDate: toDay(row.startDate),
    endDate: toDay(row.endDate),
    exitReason: row.exitReason,
    notes: row.notes,
  };
}

function toData(input: TeamMemberInput) {
  return {
    userId: input.userId,
    fullName: input.fullName,
    nameKey: normalizePersonName(input.fullName),
    document: input.document,
    birthDate: fromDay(input.birthDate),
    phone: input.phone,
    email: input.email,
    address: input.address,
    emergencyName: input.emergencyName,
    emergencyPhone: input.emergencyPhone,
    jobTitle: input.jobTitle,
    isOwner: input.isOwner,
    employmentType: input.employmentType,
    payType: input.payType,
    startDate: fromDay(input.startDate),
    endDate: fromDay(input.endDate),
    exitReason: input.exitReason,
    notes: input.notes,
  };
}

async function listStaffUsers() {
  return prisma.user.findMany({
    where: { role: { in: ["ADMIN", "EMPLEADO"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

export function createPrismaTeamRepository(): TeamRepository {
  return {
    async ensureSeed() {
      const done = await prisma.appSetting.findUnique({ where: { key: TEAM_SEED_SETTING_KEY }, select: { key: true } });
      if (done) return;
      const staff = await listStaffUsers();
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${TEAM_SEED_LOCK})`);
        const again = await tx.appSetting.findUnique({ where: { key: TEAM_SEED_SETTING_KEY }, select: { key: true } });
        if (again) return;
        const existing = await tx.teamMember.findMany({ select: { nameKey: true, userId: true } });
        // Solo si el equipo esta vacio (plan aprobado); igual planInitialTeam no duplica.
        const creations = existing.length === 0 ? planInitialTeam(existing, staff) : [];
        for (const person of creations) {
          await tx.teamMember.create({
            data: {
              fullName: person.fullName,
              nameKey: person.nameKey,
              userId: person.userId,
              jobTitle: person.jobTitle,
              isOwner: person.isOwner,
              employmentType: "FREELANCE",
              payType: person.payType,
              startDate: fromDay(person.startDate),
              endDate: fromDay(person.endDate),
            },
          });
        }
        const value = JSON.stringify({ at: new Date().toISOString(), created: creations.length });
        await tx.appSetting.create({ data: { key: TEAM_SEED_SETTING_KEY, value } });
      });
    },

    async list() {
      const rows = await prisma.teamMember.findMany({ orderBy: { fullName: "asc" } });
      return rows.map(toDomain);
    },

    async findById(id) {
      const row = await prisma.teamMember.findUnique({ where: { id } });
      return row ? toDomain(row) : null;
    },

    async findByUserId(userId) {
      const row = await prisma.teamMember.findUnique({ where: { userId } });
      return row ? toDomain(row) : null;
    },

    // Si la ficha tiene usuario, su nombre tambien queda como User.name (ventas, nomina, etc. lo leen por id).
    async create(input) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.teamMember.create({ data: toData(input) });
        if (row.userId) await tx.user.update({ where: { id: row.userId }, data: { name: row.fullName } });
        return toDomain(row);
      });
    },

    async update(id, input) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.teamMember.update({ where: { id }, data: toData(input) });
        if (row.userId) await tx.user.update({ where: { id: row.userId }, data: { name: row.fullName } });
        return toDomain(row);
      });
    },

    async setExit(id, endDate, exitReason) {
      const row = await prisma.teamMember.update({
        where: { id },
        data: { endDate: fromDay(endDate), exitReason },
      });
      return toDomain(row);
    },

    listStaffUsers,
  };
}

// ¿Ya salio del equipo? (para no dejarle asignar ordenes ni trabajos nuevos). Sin ficha = no.
export async function isRetiredUser(userId: string): Promise<boolean> {
  try {
    const row = await prisma.teamMember.findUnique({ where: { userId }, select: { endDate: true } });
    return row ? teamStatus({ endDate: toDay(row.endDate) }, todayInBogota()) === "RETIRADO" : false;
  } catch {
    return false;
  }
}

// Fichas del equipo listas para la nomina, comisiones y asignaciones. Si la tabla todavia no
// existe o falla la lectura, devuelve [] para no tumbar la nomina (queda como antes).
export async function loadTeamMembers(repository: TeamRepository = createPrismaTeamRepository()): Promise<TeamMember[]> {
  try {
    await repository.ensureSeed();
    return await repository.list();
  } catch (error) {
    console.error("[equipo] no se pudo leer el equipo:", error);
    return [];
  }
}
