import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCashPositionUseCase } from "@/modules/nomina/application/use-cases";
import { closingNote, type MonthCloseDeps } from "../application/close-month";
import { createPrismaBalancesRepository } from "./prisma-balances-repository";
import { getMoneyWithoutAccount } from "./prisma-money-without-account";

type Db = Prisma.TransactionClient | typeof prisma;

// Ya cerrada = tiene el ajuste con la nota del mes, o el cierre quedo en la bitacora (cuando cuadro).
async function closedAccountIds(db: Db, monthKey: string, accountIds?: string[]): Promise<Set<string>> {
  const note = closingNote(monthKey);
  const [movements, logs] = await Promise.all([
    db.accountMovement.findMany({
      where: { note, ...(accountIds ? { accountId: { in: accountIds } } : {}) },
      select: { accountId: true },
    }),
    db.activityLog.findMany({
      where: { entityType: "ACCOUNT", summary: { startsWith: note }, ...(accountIds ? { entityId: { in: accountIds } } : {}) },
      select: { entityId: true },
    }),
  ]);
  return new Set([...movements.map((m) => m.accountId), ...logs.flatMap((l) => (l.entityId ? [l.entityId] : []))]);
}

// La conexion del MCP no sabe quien habla: igual que en gastos, queda a nombre del dueno.
async function resolveActor() {
  const email = process.env.MCP_GASTOS_USUARIO_EMAIL?.trim().toLowerCase();
  const select = { id: true, name: true, email: true } as const;
  if (email) {
    const configured = await prisma.user.findFirst({ where: { email }, select });
    if (configured) return configured;
  }
  return prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select });
}

export function createPrismaMonthCloseDeps(): MonthCloseDeps {
  return {
    async loadAccounts() {
      const position = await getCashPositionUseCase(createPrismaBalancesRepository(), getMoneyWithoutAccount);
      return position.accounts
        .filter((account) => account.isActive)
        .map((account) => ({ id: account.id, name: account.name, balance: account.balance }));
    },

    findClosedAccountIds: (monthKey) => closedAccountIds(prisma, monthKey),

    async saveClose(input) {
      const actor = await resolveActor();
      if (!actor) throw new Error("No hay un usuario ADMIN para registrar el cierre.");
      const actorName = actor.name?.trim() || actor.email?.trim() || "Desconocido";
      return prisma.$transaction(async (tx) => {
        // Candado por mes: dos confirmaciones al mismo tiempo no crean dos ajustes.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre-mes:${input.monthKey}`}))`;
        const closed = await closedAccountIds(tx, input.monthKey, input.accountIds);
        const byAccount = new Map(input.adjustments.map((adjustment) => [adjustment.accountId, adjustment]));
        for (const accountId of input.accountIds) {
          if (closed.has(accountId)) continue;
          const adjustment = byAccount.get(accountId);
          if (adjustment) {
            await tx.accountMovement.create({
              data: {
                accountId,
                type: adjustment.type,
                amount: adjustment.amount,
                note: input.note,
                movementDate: input.movementDate,
                createdById: actor.id,
              },
            });
          }
          await tx.activityLog.create({
            data: {
              actorId: actor.id,
              actorName,
              action: adjustment ? "CREATE" : "UPDATE",
              entityType: "ACCOUNT",
              entityId: accountId,
              summary: (adjustment ? `${adjustment.summary} (por Claude)` : `${input.note}: cuadró (por Claude)`).slice(0, 500),
            },
          });
        }
        return { skippedAccountIds: input.accountIds.filter((id) => closed.has(id)) };
      });
    },
  };
}

// Para el aviso del ultimo dia: cuentas activas y cuales ya se cerraron ese mes.
export async function loadCloseStatus(monthKey: string) {
  const deps = createPrismaMonthCloseDeps();
  const [accounts, closed] = await Promise.all([deps.loadAccounts(), deps.findClosedAccountIds(monthKey)]);
  return accounts.map((account) => ({ name: account.name, closed: closed.has(account.id) }));
}
