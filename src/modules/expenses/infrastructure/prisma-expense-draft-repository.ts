import { prisma } from "@/lib/prisma";
import type { ExpenseDraftRepository, ExpenseDraftView } from "../domain/repository";

// Borradores de gastos dichos a Claude (MCP) que esperan la foto del soporte.
export function createPrismaExpenseDraftRepository(): ExpenseDraftRepository {
  return {
    async create(input) {
      const row = await prisma.gastoBorrador.create({
        data: {
          tokenHash: input.tokenHash,
          categoryId: input.categoryId,
          accountId: input.accountId,
          amount: input.amount,
          expenseDate: input.expenseDate,
          description: input.description,
          motivoRetroactivo: input.retroMotivo,
          employeeId: input.employeeId,
          createdById: input.createdById,
          expiraEn: input.expiresAt,
        },
        select: { id: true },
      });
      return { id: row.id };
    },

    async findByTokenHash(tokenHash): Promise<ExpenseDraftView | null> {
      const draft = await prisma.gastoBorrador.findUnique({
        where: { tokenHash },
        include: { createdBy: { select: { name: true, email: true } } },
      });
      if (!draft) {
        return null;
      }
      const [category, account] = await Promise.all([
        prisma.expenseCategory.findUnique({ where: { id: draft.categoryId }, select: { name: true } }),
        prisma.account.findUnique({ where: { id: draft.accountId }, select: { name: true, type: true } }),
      ]);
      if (!category || !account) {
        return null;
      }
      return {
        id: draft.id,
        status: draft.estado,
        attempts: draft.intentos,
        amount: Number(draft.amount),
        expenseDate: draft.expenseDate,
        description: draft.description,
        retroMotivo: draft.motivoRetroactivo,
        employeeId: draft.employeeId,
        categoryId: draft.categoryId,
        categoryName: category.name,
        accountId: draft.accountId,
        accountName: account.name,
        accountType: account.type,
        createdById: draft.createdById,
        createdByName: draft.createdBy.name?.trim() || draft.createdBy.email,
        expiresAt: draft.expiraEn,
      };
    },

    async recordRejection(draftId, rejection) {
      // Un solo UPDATE atomico: suma el intento y, si llega al maximo, cierra el borrador.
      await prisma.$executeRaw`
        UPDATE "GastoBorrador"
        SET "intentos" = "intentos" + 1,
            "ultimoMotivoRechazo" = ${rejection.reason},
            "revision" = ${JSON.stringify(rejection.revision ?? null)}::jsonb,
            "estado" = CASE WHEN "intentos" + 1 >= ${rejection.maxAttempts} THEN 'RECHAZADO'::"GastoBorradorEstado" ELSE "estado" END
        WHERE "id" = ${draftId} AND "estado" = 'PENDIENTE'::"GastoBorradorEstado"`;
    },

    async markExpired(draftId) {
      await prisma.gastoBorrador.updateMany({
        where: { id: draftId, estado: "PENDIENTE" },
        data: { estado: "VENCIDO" },
      });
    },
  };
}
