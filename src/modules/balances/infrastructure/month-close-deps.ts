import { logActivityAs } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { marcaCierre, type CierreDeps } from "../application/close-month";
import { createPrismaBalancesRepository } from "./prisma-balances-repository";

// Une el cierre de mes con Prisma. El actor del MCP es el mismo de los gastos por voz.
export function createMonthCloseDeps(actor: { id: string; name?: string | null; email?: string | null }): CierreDeps {
  return {
    async listarCuentas(period) {
      // Saldo de cierre del mes (el "balance" del periodo es acumulado).
      const balances = await createPrismaBalancesRepository().listAccountBalances(period);
      return balances
        .filter((account) => account.isActive)
        .map((account) => ({ id: account.id, name: account.name, type: account.type, balance: account.balance }));
    },

    async cuentasCerradas(note) {
      const rows = await prisma.accountMovement.findMany({ where: { note }, select: { accountId: true } });
      return new Set(rows.map((row) => row.accountId));
    },

    // Candado por cuenta y mes: dos confirmaciones a la vez no crean dos ajustes.
    crearAjuste: (input) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cierre:${input.accountId}:${input.note}`}))`;
        const existing = await tx.accountMovement.findFirst({
          where: { accountId: input.accountId, note: input.note },
          select: { id: true },
        });
        if (existing) return false;
        await tx.accountMovement.create({ data: { ...input, createdById: actor.id } });
        return true;
      }),

    bitacora: (mes, summary) =>
      logActivityAs(actor, { action: "CREATE", entityType: "ACCOUNT", entityId: marcaCierre(mes), summary }),
  };
}
