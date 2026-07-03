import type { AccountTransaction } from "../domain/entities";

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export type AccountBalanceMetrics = {
  periodOpening: number;
  ingreso: number;
  gasto: number;
  movimientos: number;
  balance: number;
};

export function toAccountDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function accountMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentBogotaMonthKey(date: Date = new Date()): string {
  const bogotaDate = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  return accountMonthKey(bogotaDate);
}

// Límites [from, to) en UTC: las fechas contables se guardan como medianoche UTC.
export function accountMonthRange(key: string): { from: Date; to: Date } {
  const [year, month] = key.split("-").map(Number);
  return { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 1)) };
}

// Misma lógica que summarizeAccountBalance, pero a partir de las transacciones.
export function computeAccountBalanceMetrics(
  transactions: AccountTransaction[],
  openingBalance: number,
  range: { from: Date; to: Date } | null,
): AccountBalanceMetrics {
  let periodOpening = openingBalance;
  let ingreso = 0;
  let gasto = 0;
  let movimientos = 0;

  for (const txn of transactions) {
    const date = toAccountDate(txn.date);
    if (range && date < range.from) {
      // Saldo de cierre del periodo anterior: apertura + todos los flujos previos.
      periodOpening += txn.amount;
      continue;
    }
    if (range && date >= range.to) {
      continue;
    }

    switch (txn.type) {
      case "INCOME":
        ingreso += txn.amount;
        break;
      case "EXPENSE":
        gasto += -txn.amount;
        break;
      case "MOVEMENT_IN":
      case "MOVEMENT_OUT":
        movimientos += txn.amount;
        break;
    }
  }

  return {
    periodOpening,
    ingreso,
    gasto,
    movimientos,
    balance: ingreso - gasto + movimientos,
  };
}
