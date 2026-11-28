import { displayCode } from "@/lib/code-display";
import { prisma } from "@/lib/prisma";
import type { AccountLedgerInput } from "../domain/account-ledger";

// SOLO LECTURA. Lee los movimientos de una cuenta con las mismas tablas y filtros que el saldo
// de "Dinero hoy" (listAccountBalances sin periodo), para que el saldo final cuadre con él.

export type LedgerAccount = { id: string; name: string; type: string; isActive: boolean; openingBalance: number };

const num = (value: { toString(): string } | null | undefined) => (value == null ? 0 : Number(value.toString()));

const refs = (...codes: (string | null | undefined)[]) => {
  const shown = [...new Set(codes.filter((code): code is string => Boolean(code)).map((code) => displayCode(code)))];
  return shown.length ? shown.join(" · ") : null;
};

/** Cuentas del negocio (sin la del dueño, OWNER), igual que saldos_de_cuentas. */
export async function listLedgerAccounts(): Promise<LedgerAccount[]> {
  const accounts = await prisma.account.findMany({
    where: { type: { not: "OWNER" } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, isActive: true, openingBalance: true },
  });
  return accounts.map((account) => ({ ...account, openingBalance: num(account.openingBalance) }));
}

export async function getAccountLedgerRows(accountId: string): Promise<AccountLedgerInput[]> {
  const who = { select: { name: true, email: true } } as const;
  const [salePayments, supplierPayments, shippingCosts, expenses, movements] = await Promise.all([
    // Las retenciones en la fuente van sin cuenta (accountId NULL): filtrar por cuenta ya las deja fuera.
    prisma.salePayment.findMany({
      where: { accountId },
      select: {
        amount: true,
        paymentDate: true,
        createdAt: true,
        paymentMethod: true,
        note: true,
        createdBy: who,
        sale: { select: { code: true, order: { select: { code: true } } } },
      },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { accountId, type: "PAYMENT" },
      select: {
        amount: true,
        paymentDate: true,
        createdAt: true,
        supplierId: true,
        note: true,
        transactionReference: true,
        createdBy: who,
        supplier: { select: { name: true } },
        sale: { select: { code: true } },
        order: { select: { code: true, manufacturingOrders: { select: { code: true, supplierId: true } } } },
        dispatch: { select: { code: true } },
      },
    }),
    prisma.shippingCost.findMany({
      where: { accountId },
      select: {
        amount: true,
        paymentDate: true,
        shippingProvider: true,
        transactionReference: true,
        createdBy: who,
        sale: { select: { code: true, order: { select: { code: true } } } },
      },
    }),
    prisma.expense.findMany({
      where: { accountId },
      select: {
        amount: true,
        expenseDate: true,
        description: true,
        reference: true,
        createdBy: who,
        category: { select: { name: true } },
      },
    }),
    prisma.accountMovement.findMany({
      // TRANSFER se desglosa en filas IN/OUT al crearse: el saldo solo suma IN y OUT.
      where: { accountId, type: { in: ["IN", "OUT"] } },
      select: { type: true, amount: true, movementDate: true, note: true, transferId: true, saleId: true, createdBy: who },
    }),
  ]);
  // Devoluciones a clientas: AccountMovement.saleId no tiene llave foránea, el código se busca aparte.
  const refundSaleIds = [...new Set(movements.map((row) => row.saleId).filter((id): id is string => Boolean(id)))];
  const refundSales = refundSaleIds.length
    ? await prisma.sale.findMany({ where: { id: { in: refundSaleIds } }, select: { id: true, code: true } })
    : [];
  const saleCode = new Map(refundSales.map((sale) => [sale.id, sale.code] as const));

  const person = (user: { name: string | null; email: string } | null) => (user ? user.name || user.email : null);

  return [
    ...salePayments.map((row) => ({
      fecha: row.paymentDate ?? row.createdAt,
      origen: "abono" as const,
      sentido: "entrada" as const,
      valor: num(row.amount),
      referencia: refs(row.sale?.code, row.sale?.order?.code),
      nota: [row.paymentMethod, row.note].filter(Boolean).join(" · ") || null,
      registradoPor: person(row.createdBy),
    })),
    ...supplierPayments.map((row) => ({
      fecha: row.paymentDate ?? row.createdAt,
      origen: "pago_proveedora" as const,
      sentido: "salida" as const,
      valor: num(row.amount),
      referencia: refs(
        row.sale?.code,
        row.order?.code,
        row.order?.manufacturingOrders.find((of) => of.supplierId === row.supplierId)?.code,
        row.dispatch?.code,
      ),
      nota: [row.supplier.name, row.transactionReference, row.note].filter(Boolean).join(" · ") || null,
      registradoPor: person(row.createdBy),
    })),
    ...shippingCosts.map((row) => ({
      fecha: row.paymentDate,
      origen: "flete" as const,
      sentido: "salida" as const,
      valor: num(row.amount),
      referencia: refs(row.sale?.code, row.sale?.order?.code),
      nota: [row.shippingProvider, row.transactionReference].filter(Boolean).join(" · ") || null,
      registradoPor: person(row.createdBy),
    })),
    ...expenses.map((row) => ({
      fecha: row.expenseDate,
      origen: "gasto" as const,
      sentido: "salida" as const,
      valor: num(row.amount),
      categoria: row.category.name,
      referencia: row.reference ?? null,
      nota: [row.category.name, row.description].filter(Boolean).join(" · ") || null,
      registradoPor: person(row.createdBy),
    })),
    ...movements.map((row) => ({
      fecha: row.movementDate,
      origen: "movimiento" as const,
      sentido: row.type === "IN" ? ("entrada" as const) : ("salida" as const),
      valor: num(row.amount),
      traslado: Boolean(row.transferId),
      devolucionDe: row.saleId && saleCode.has(row.saleId) ? displayCode(saleCode.get(row.saleId)!) : null,
      referencia: row.saleId ? refs(saleCode.get(row.saleId)) : null,
      nota: row.note ?? null,
      registradoPor: person(row.createdBy),
    })),
  ];
}
