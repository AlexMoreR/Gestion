import { logActivityAs } from "@/lib/activity-log";
import { removeExpenseReceipt, saveExpenseReceiptBytes } from "@/lib/expense-receipt";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { normalizeWord } from "../domain/expense-draft";
import type { VoiceExpenseDeps } from "../application/register-expense-by-voice";
import { createClaudeReceiptValidator } from "./claude-receipt-validator";
import { createPrismaExpenseDraftRepository } from "./prisma-expense-draft-repository";
import { createPrismaExpensesRepository } from "./prisma-expenses-repository";

// Une los puertos de "registrar gasto por voz/chat" con Prisma, el disco y la IA de Anthropic.
export function createVoiceExpenseDeps(): VoiceExpenseDeps {
  return {
    expenses: createPrismaExpensesRepository(),
    drafts: createPrismaExpenseDraftRepository(),
    validator: createClaudeReceiptValidator(),

    async listAccounts() {
      const accounts = await prisma.account.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true },
      });
      return accounts;
    },

    async findEmployees(query) {
      const users = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "EMPLEADO"] } },
        select: { id: true, name: true, email: true },
      });
      return users
        .map((user) => ({ id: user.id, name: user.name?.trim() || user.email }))
        .filter((user) => normalizeWord(user.name).includes(query));
    },

    // La conexion del MCP no sabe quien habla: el gasto queda a nombre del dueno.
    async resolveActor() {
      const email = process.env.MCP_GASTOS_USUARIO_EMAIL?.trim().toLowerCase();
      const select = { id: true, name: true, email: true } as const;
      if (email) {
        const configured = await prisma.user.findFirst({ where: { email }, select });
        if (configured) {
          return configured;
        }
      }
      return prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select });
    },

    receiptStore: {
      save: (file) => saveExpenseReceiptBytes(file.bytes, file.name, file.ext),
      remove: removeExpenseReceipt,
    },
    siteUrl: (path) => getSiteUrl(path),
    logActivity: (actor, entry) =>
      logActivityAs(actor, { action: "CREATE", entityType: "EXPENSE", entityId: entry.expenseId, summary: entry.summary }),
  };
}
