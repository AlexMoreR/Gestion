import type { AccountTransaction } from "../domain/entities";

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export type AccountBalanceMetrics = {
  periodOpening: number;
  ingreso: number;
  gasto: number;
  movimientos: number;
  balance: number;
};

export type AccountTransactionWithBalance = AccountTransaction & {
  runningBalance: number;
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

export function attachAccountTransactionBalances(
  transactions: AccountTransaction[],
  openingBalance: number,
): AccountTransactionWithBalance[] {
  const balancesByIndex = new Map<number, number>();
  let runningBalance = openingBalance;

  for (const [index, transaction] of Array.from(transactions.entries()).reverse()) {
    runningBalance += transaction.amount;
    balancesByIndex.set(index, runningBalance);
  }

  return transactions.map((transaction, index) => ({
    ...transaction,
    runningBalance: balancesByIndex.get(index) ?? openingBalance + transaction.amount,
  }));
}

export type AccountReviewPoint = {
  id: string;
  date: Date;
  concept: string;
  amount: number;
};

export type SuspiciousOutflow = AccountReviewPoint & {
  // Por qué parece un pago de banco y no de esta cuenta.
  signal: string;
};

export type AccountHistoryReview = {
  lowestBalance: number;
  // null si el punto más bajo es el saldo inicial (ningún movimiento lo bajó).
  lowestDate: Date | null;
  // Cuánto saldo inicial más haría falta para no quedar nunca en negativo.
  neededOpening: number;
  firstNegative: (AccountReviewPoint & { balance: number }) | null;
  suspicious: SuspiciousOutflow[];
  neededOpeningWithoutSuspicious: number;
};

const BANK_WORDS = /\b(transferencia|bancolombia|nequi|bre-b|pse)\b/;

function bankSignal(txn: AccountTransaction): string | null {
  const reference = txn.transactionReference?.trim();
  if (reference) {
    return `Número de comprobante: ${reference}`;
  }
  if (txn.receiptUrl) {
    return "Tiene foto del comprobante";
  }
  const note = (txn.note ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const word = BANK_WORDS.exec(note)?.[1];
  return word ? `La nota dice "${word}"` : null;
}

// Orden cronológico; dentro del mismo día, las entradas antes que las salidas.
function sortChronologically(transactions: AccountTransaction[]): AccountTransaction[] {
  return [...transactions].sort((a, b) => {
    const dateA = toAccountDate(a.date);
    const dateB = toAccountDate(b.date);
    const dayA = dateA.toISOString().slice(0, 10);
    const dayB = dateB.toISOString().slice(0, 10);
    if (dayA !== dayB) {
      return dayA < dayB ? -1 : 1;
    }
    const inflowA = a.amount >= 0 ? 0 : 1;
    const inflowB = b.amount >= 0 ? 0 : 1;
    return inflowA - inflowB || dateA.getTime() - dateB.getTime();
  });
}

function walkBalance(sorted: AccountTransaction[], openingBalance: number) {
  let balance = openingBalance;
  let lowestBalance = openingBalance;
  let lowestDate: Date | null = null;
  let firstNegative: AccountHistoryReview["firstNegative"] = null;

  for (const txn of sorted) {
    balance += txn.amount;
    const date = toAccountDate(txn.date);
    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestDate = date;
    }
    if (!firstNegative && balance < 0) {
      firstNegative = { id: txn.id, date, concept: txn.concept, amount: txn.amount, balance };
    }
  }

  // = max(0, −punto más bajo sin el saldo inicial) − saldo inicial, mínimo 0.
  return { lowestBalance, lowestDate, firstNegative, neededOpening: Math.max(0, -lowestBalance) };
}

// Revisión de solo lectura: dónde quedó la cuenta en negativo y qué salidas de una caja
// en efectivo parecen pagos hechos desde un banco. Es una pista, no una certeza.
export function reviewAccountHistory(
  transactions: AccountTransaction[],
  opts: { openingBalance: number; accountType: string },
): AccountHistoryReview {
  const sorted = sortChronologically(transactions);
  const walk = walkBalance(sorted, opts.openingBalance);

  const suspicious: SuspiciousOutflow[] = [];
  if (opts.accountType === "CASH") {
    for (const txn of sorted) {
      const signal = txn.amount < 0 ? bankSignal(txn) : null;
      if (signal) {
        suspicious.push({ id: txn.id, date: toAccountDate(txn.date), concept: txn.concept, amount: txn.amount, signal });
      }
    }
  }

  const suspiciousIds = new Set(suspicious.map((row) => row.id));
  const withoutSuspicious = walkBalance(
    sorted.filter((txn) => !suspiciousIds.has(txn.id)),
    opts.openingBalance,
  );

  return {
    ...walk,
    suspicious,
    neededOpeningWithoutSuspicious: withoutSuspicious.neededOpening,
  };
}
