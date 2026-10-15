import type { AccountBalance, AccountType } from "./entities";

// "¿Cuánto dinero hay hoy?": saldo actual de cada cuenta y totales por tipo.
// Saldo actual = saldo inicial configurado + todo lo que entro - todo lo que salio
// (pagos de clientes, pagos a proveedoras, fletes, gastos y movimientos manuales).
// Se calcula con listAccountBalances SIN periodo: ahi periodOpening = saldo inicial
// configurado y balance = neto de toda la historia.

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Efectivo",
  BANK: "Bancos",
  WALLET: "Billeteras",
  OTHER: "Otras",
};

export type CashAccountLine = {
  id: string;
  name: string;
  type: AccountType;
  isActive: boolean;
  balance: number;
};

export type MoneyWithoutAccount = {
  salePayments: { count: number; amount: number };
  supplierPayments: { count: number; amount: number };
  shippingCosts: { count: number; amount: number };
};

export type CashPosition = {
  accounts: CashAccountLine[];
  byType: { type: AccountType; label: string; balance: number }[];
  total: number;
  withoutAccount: MoneyWithoutAccount & { count: number };
};

export function currentAccountBalance(account: AccountBalance): number {
  return Math.round(account.periodOpening + account.balance);
}

export function summarizeCashPosition(allTime: AccountBalance[], withoutAccount: MoneyWithoutAccount): CashPosition {
  // Las cuentas inactivas solo se muestran si todavia tienen plata.
  const accounts = allTime
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      isActive: account.isActive,
      balance: currentAccountBalance(account),
    }))
    .filter((account) => account.isActive || account.balance !== 0);

  const order: AccountType[] = ["CASH", "BANK", "WALLET", "OTHER"];
  const byType = order
    .map((type) => ({
      type,
      label: ACCOUNT_TYPE_LABELS[type],
      balance: accounts.filter((account) => account.type === type).reduce((sum, account) => sum + account.balance, 0),
    }))
    .filter((group) => group.type === "CASH" || group.type === "BANK" || accounts.some((account) => account.type === group.type));

  return {
    accounts,
    byType,
    total: accounts.reduce((sum, account) => sum + account.balance, 0),
    withoutAccount: {
      ...withoutAccount,
      count: withoutAccount.salePayments.count + withoutAccount.supplierPayments.count + withoutAccount.shippingCosts.count,
    },
  };
}
