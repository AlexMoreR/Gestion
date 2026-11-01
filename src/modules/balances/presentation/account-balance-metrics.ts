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

export type AccountReviewMove = {
  id: string;
  date: Date;
  concept: string;
  amount: number;
  // Saldo de la cuenta justo después de este movimiento.
  balance: number;
};

export type SuspiciousAccountExit = {
  id: string;
  date: Date;
  concept: string;
  amount: number;
  signal: string;
};

export type AccountHistoryReview = {
  lowestBalance: number;
  lowestDate: Date | null;
  neededOpening: number;
  firstNegative: AccountReviewMove | null;
  suspicious: SuspiciousAccountExit[];
  neededOpeningWithoutSuspicious: number;
};

const BANK_WORDS = /\b(transferencia|bancolombia|nequi|bre-?b|pse)\b/;

function normalizeNote(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Señal de que una salida se pagó por banco y no en efectivo (pista, no certeza).
function bankSignal(txn: AccountTransaction): string | null {
  if (txn.transactionReference?.trim()) {
    return `Tiene número de transacción (${txn.transactionReference.trim()})`;
  }
  if (txn.receiptUrl) {
    return "Tiene foto del comprobante";
  }
  const word = txn.note ? normalizeNote(txn.note).match(BANK_WORDS)?.[1] : undefined;
  return word ? `La nota dice "${word}"` : null;
}

// Orden cronológico; dentro del mismo día (fecha contable UTC) las entradas van antes que las salidas.
function sortForReview(transactions: AccountTransaction[]): AccountTransaction[] {
  const dayKey = (txn: AccountTransaction) => toAccountDate(txn.date).toISOString().slice(0, 10);
  return [...transactions].sort((a, b) => {
    const dayA = dayKey(a);
    const dayB = dayKey(b);
    if (dayA !== dayB) return dayA < dayB ? -1 : 1;
    const inA = a.amount >= 0 ? 0 : 1;
    const inB = b.amount >= 0 ? 0 : 1;
    if (inA !== inB) return inA - inB;
    return toAccountDate(a.date).getTime() - toAccountDate(b.date).getTime();
  });
}

// Punto más bajo de los flujos sin saldo inicial (0 si nunca bajan de cero).
function lowestFlowPoint(sorted: AccountTransaction[]): number {
  let running = 0;
  let lowest = 0;
  for (const txn of sorted) {
    running += txn.amount;
    lowest = Math.min(lowest, running);
  }
  return lowest;
}

function neededOpeningFor(sorted: AccountTransaction[], openingBalance: number): number {
  return Math.max(0, -lowestFlowPoint(sorted) - openingBalance);
}

// Revisión de todo el historial de una cuenta: dónde tocó fondo, desde cuándo está en negativo
// y qué salidas de una caja en efectivo parecen pagadas por banco. No cambia ningún saldo.
export function reviewAccountHistory(
  transactions: AccountTransaction[],
  opts: { openingBalance: number; accountType: string },
): AccountHistoryReview {
  const sorted = sortForReview(transactions);
  let running = opts.openingBalance;
  let lowestBalance = opts.openingBalance;
  let lowestDate: Date | null = null;
  let firstNegative: AccountReviewMove | null = null;

  for (const txn of sorted) {
    running += txn.amount;
    if (running < lowestBalance) {
      lowestBalance = running;
      lowestDate = toAccountDate(txn.date);
    }
    if (!firstNegative && running < 0) {
      firstNegative = {
        id: txn.id,
        date: toAccountDate(txn.date),
        concept: txn.concept,
        amount: txn.amount,
        balance: running,
      };
    }
  }

  const suspicious: SuspiciousAccountExit[] = [];
  if (opts.accountType === "CASH") {
    for (const txn of sorted) {
      if (txn.amount >= 0) continue;
      const signal = bankSignal(txn);
      if (signal) {
        suspicious.push({ id: txn.id, date: toAccountDate(txn.date), concept: txn.concept, amount: txn.amount, signal });
      }
    }
  }
  const suspiciousIds = new Set(suspicious.map((row) => row.id));

  return {
    lowestBalance,
    lowestDate,
    neededOpening: neededOpeningFor(sorted, opts.openingBalance),
    firstNegative,
    suspicious,
    neededOpeningWithoutSuspicious: neededOpeningFor(
      sorted.filter((txn) => !suspiciousIds.has(txn.id)),
      opts.openingBalance,
    ),
  };
}
