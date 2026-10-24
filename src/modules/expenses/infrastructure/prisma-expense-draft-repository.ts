import { prisma } from "@/lib/prisma";
import { DRAFT_SAVED_MARK, ExpenseDraftUsedError } from "../domain/expense-draft";
import type { ExpenseDraftRepository, ExpenseDraftView } from "../domain/repository";

// Enlaces de gastos dichos a Claude (MCP) para subir la foto (opcional) del soporte.
export function createPrismaExpenseDraftRepository(): ExpenseDraftRepository {
  return {
    async create(input) {
      const row = await prisma.gastoBorrador.create({
        data: {
          tokenHash: input.tokenHash,
          expenseId: input.expenseId,
          revision: DRAFT_SAVED_MARK,
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
        expenseId: draft.expenseId,
        savedOnConfirm: (draft.revision as { modo?: unknown } | null)?.modo === DRAFT_SAVED_MARK.modo,
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

    async attachReceipt(draftId, receipt) {
      await prisma.$transaction(async (tx) => {
        // Candado de la fila: un doble envio espera aqui y luego lo ve GUARDADO.
        const locked = await tx.$queryRaw<Array<{ estado: string }>>`
          SELECT "estado"::text AS "estado" FROM "GastoBorrador" WHERE "id" = ${draftId} FOR UPDATE`;
        if (locked[0]?.estado !== "PENDIENTE") {
          throw new ExpenseDraftUsedError();
        }
        await tx.expense.update({
          where: { id: receipt.expenseId },
          data: { receiptUrl: receipt.url, receiptName: receipt.name },
        });
        await tx.gastoBorrador.update({ where: { id: draftId }, data: { estado: "GUARDADO" } });
      });
    },

    async markExpired(draftId) {
      await prisma.gastoBorrador.updateMany({
        where: { id: draftId, estado: "PENDIENTE" },
        data: { estado: "VENCIDO" },
      });
    },
  };
}
