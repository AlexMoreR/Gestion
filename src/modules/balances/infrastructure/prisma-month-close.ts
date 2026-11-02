import { logActivityAs } from "@/lib/activity-log";
import { colombiaMonthRange, todayInColombia } from "@/lib/colombia-time";
import { prisma } from "@/lib/prisma";
import { createVoiceExpenseDeps } from "@/modules/expenses/infrastructure/voice-expense-deps";
import { closeMonthNote, type MonthCloseDeps } from "../application/close-month";
import { currentAccountBalance } from "../domain/cash-position";
import { createPrismaBalancesRepository } from "./prisma-balances-repository";

// La bitacora del cierre usa esta llave: asi el aviso del ultimo dia sabe si el mes ya se cerro.
export function closeMonthLogId(month: string): string {
  return `cierre-mes:${month}`;
}

export async function isMonthClosed(month: string): Promise<boolean> {
  const row = await prisma.activityLog.findFirst({
    where: { entityType: "ACCOUNT", entityId: closeMonthLogId(month) },
    select: { id: true },
  });
  return row !== null;
}

export function createPrismaMonthCloseDeps(): MonthCloseDeps {
  return {
    now: () => new Date(),

    async loadAccounts(month) {
      // Mes en curso (cierre del ultimo dia): el saldo de hoy, igual a "Dinero hoy".
      // Mes pasado: el saldo al cierre de ese mes.
      const range = colombiaMonthRange(month);
      const period = month === todayInColombia().slice(0, 7) ? undefined : { from: range.start, to: range.end };
      const [balances, closed] = await Promise.all([
        createPrismaBalancesRepository().listAccountBalances(period),
        prisma.accountMovement.findMany({ where: { note: closeMonthNote(month) }, select: { accountId: true } }),
      ]);
      const closedIds = new Set(closed.map((row) => row.accountId));
      return balances
        .filter((account) => account.isActive && account.type !== "OWNER")
        .map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          saldoGestion: currentAccountBalance(account),
          cerrada: closedIds.has(account.id),
        }));
    },

    async applyAdjustments({ month, note, movementDate, adjustments, createdById }) {
      return prisma.$transaction(async (tx) => {
        // Candado por mes: dos confirmaciones a la vez no crean dos ajustes en la misma cuenta.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-mes:${month}`}))`;
        const existing = await tx.accountMovement.findMany({
          where: { note, accountId: { in: adjustments.map((item) => item.accountId) } },
          select: { accountId: true },
        });
        const skip = new Set(existing.map((row) => row.accountId));
        const pending = adjustments.filter((item) => !skip.has(item.accountId));
        for (const item of pending) {
          await tx.accountMovement.create({
            data: { accountId: item.accountId, type: item.type, amount: item.amount, note, movementDate, createdById },
          });
        }
        return pending.map((item) => item.accountId);
      });
    },

    // La conexion del MCP no sabe quien habla: queda a nombre del dueno, como los gastos.
    resolveActor: () => createVoiceExpenseDeps().resolveActor(),

    logActivity: (actor, entry) =>
      logActivityAs(actor, { action: "CREATE", entityType: "ACCOUNT", entityId: closeMonthLogId(entry.month), summary: entry.summary }),
  };
}
