import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AttendanceMark } from "../domain/attendance";
import type { AsistenciaRepository, AttendanceStaff, NewAttendanceMark } from "../domain/repository";
import { getWorkedDaysByMonthUseCase } from "../application/use-cases";

// Las columnas @db.Date llegan como medianoche UTC: se leen y escriben como "AAAA-MM-DD".
function toDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function fromDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function previousDay(day: string): string {
  return toDay(new Date(fromDay(day).getTime() - 24 * 60 * 60 * 1000));
}

const markSelect = {
  id: true,
  userId: true,
  tipo: true,
  marcadaEn: true,
  dia: true,
  origen: true,
  creadaPorId: true,
  motivo: true,
  corrigeAId: true,
  anuladaEn: true,
  anuladaPorId: true,
  motivoAnulacion: true,
  createdAt: true,
  creadaPor: { select: { name: true, email: true } },
  anuladaPor: { select: { name: true, email: true } },
} satisfies Prisma.AsistenciaMarcaSelect;

type MarkRow = Prisma.AsistenciaMarcaGetPayload<{ select: typeof markSelect }>;

function personName(user: { name: string | null; email: string } | null): string | null {
  if (!user) return null;
  return user.name?.trim() || user.email;
}

function toDomain(row: MarkRow): AttendanceMark {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.tipo,
    markedAt: row.marcadaEn,
    day: toDay(row.dia),
    origin: row.origen,
    createdById: row.creadaPorId,
    createdByName: personName(row.creadaPor),
    reason: row.motivo,
    correctsId: row.corrigeAId,
    voidedAt: row.anuladaEn,
    voidedById: row.anuladaPorId,
    voidedByName: personName(row.anuladaPor),
    voidReason: row.motivoAnulacion,
    createdAt: row.createdAt,
  };
}

function toData(mark: NewAttendanceMark): Prisma.AsistenciaMarcaUncheckedCreateInput {
  return {
    userId: mark.userId,
    tipo: mark.kind,
    marcadaEn: mark.markedAt,
    dia: fromDay(mark.day),
    origen: mark.origin,
    creadaPorId: mark.createdById,
    motivo: mark.reason,
    corrigeAId: mark.correctsId,
  };
}

// Candado de Postgres por persona (se suelta al terminar la transaccion): marcar, corregir y
// anular de una misma persona no se cruzan.
async function lockPerson(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asistencia:${userId}`}))`;
}

// Dias trabajados del mes por persona, para la nomina (solo se usa desde ASISTENCIA_NOMINA_DESDE).
export async function loadAttendanceDays(month: string): Promise<Record<string, number>> {
  return getWorkedDaysByMonthUseCase(createPrismaAsistenciaRepository(), month);
}

export function createPrismaAsistenciaRepository(): AsistenciaRepository {
  return {
    async listStaff(): Promise<AttendanceStaff[]> {
      const users = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "EMPLEADO"] } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          teamMember: { select: { startDate: true, endDate: true } },
        },
      });
      return users.map((user) => ({
        id: user.id,
        name: user.name?.trim() || user.email,
        role: user.role === "ADMIN" ? "ADMIN" : "EMPLEADO",
        startDate: user.teamMember?.startDate ? toDay(user.teamMember.startDate) : null,
        endDate: user.teamMember?.endDate ? toDay(user.teamMember.endDate) : null,
        hasTeamRecord: user.teamMember !== null,
      }));
    },

    async listMarks(filter) {
      const rows = await prisma.asistenciaMarca.findMany({
        where: {
          dia: { gte: fromDay(filter.fromDay), lte: fromDay(filter.toDay) },
          ...(filter.userId ? { userId: filter.userId } : {}),
        },
        orderBy: { marcadaEn: "asc" },
        select: markSelect,
      });
      return rows.map(toDomain);
    },

    async findMark(id) {
      const row = await prisma.asistenciaMarca.findUnique({ where: { id }, select: markSelect });
      return row ? toDomain(row) : null;
    },

    async markNow({ userId, createdById, origin, decide }) {
      return prisma.$transaction(async (tx) => {
        // Candado por persona: dos clics al tiempo esperan uno al otro.
        await lockPerson(tx, userId);
        // La hora la pone el servidor: se toma dentro del candado.
        const now = new Date();
        const sinceDay = previousDay(toDay(new Date(now.getTime() - 5 * 60 * 60 * 1000)));
        const recent = await tx.asistenciaMarca.findMany({
          where: { userId, dia: { gte: fromDay(sinceDay) } },
          orderBy: { marcadaEn: "asc" },
          select: markSelect,
        });
        const { kind, day } = decide(recent.map(toDomain), now);
        const created = await tx.asistenciaMarca.create({
          data: toData({ userId, kind, markedAt: now, day, origin, createdById, reason: null, correctsId: null }),
          select: markSelect,
        });
        return toDomain(created);
      });
    },

    async create(mark) {
      return prisma.$transaction(async (tx) => {
        await lockPerson(tx, mark.userId);
        const created = await tx.asistenciaMarca.create({ data: toData(mark), select: markSelect });
        return toDomain(created);
      });
    },

    async voidMark({ id, voidedById, reason, replacement }) {
      return prisma.$transaction(async (tx) => {
        const target = await tx.asistenciaMarca.findUnique({ where: { id }, select: { userId: true } });
        if (!target) return { voided: false, replacement: null };
        await lockPerson(tx, target.userId);
        // Solo se anula si sigue vigente (dos correcciones al tiempo no anulan dos veces).
        const updated = await tx.asistenciaMarca.updateMany({
          where: { id, anuladaEn: null },
          data: { anuladaEn: new Date(), anuladaPorId: voidedById, motivoAnulacion: reason },
        });
        if (updated.count === 0) return { voided: false, replacement: null };
        if (!replacement) return { voided: true, replacement: null };
        const created = await tx.asistenciaMarca.create({ data: toData(replacement), select: markSelect });
        return { voided: true, replacement: toDomain(created) };
      });
    },
  };
}
