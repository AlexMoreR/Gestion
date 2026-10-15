import { prisma } from "@/lib/prisma";
import type { MoneyWithoutAccount } from "../domain/cash-position";

// Plata registrada sin decir de que cuenta entro o salio: no suma ni resta en ningun saldo,
// por eso el saldo de la app puede no cuadrar con el banco hasta que se le asigne cuenta.
export async function getMoneyWithoutAccount(): Promise<MoneyWithoutAccount> {
  const [salePayments, supplierPayments, shippingCosts] = await Promise.all([
    prisma.salePayment.aggregate({ where: { accountId: null }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.supplierLedgerEntry.aggregate({
      where: { accountId: null, type: "PAYMENT" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.shippingCost.aggregate({ where: { accountId: null }, _count: { _all: true }, _sum: { amount: true } }),
  ]);
  const pick = (row: { _count: { _all: number }; _sum: { amount: unknown } }) => ({
    count: row._count._all,
    amount: Math.round(Number(row._sum.amount ?? 0)),
  });
  return {
    salePayments: pick(salePayments),
    supplierPayments: pick(supplierPayments),
    shippingCosts: pick(shippingCosts),
  };
}
