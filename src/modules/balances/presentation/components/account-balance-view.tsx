"use client";

import * as React from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Scale, Wallet } from "lucide-react";
import { StatList } from "@/components/ui/stat-list";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { AccountTransaction } from "@/modules/balances/domain/entities";
import {
  accountMonthKey,
  accountMonthRange,
  computeAccountBalanceMetrics,
  currentBogotaMonthKey,
  toAccountDate,
  type AccountHistoryReview,
} from "../account-balance-metrics";
import { AccountTransactionsTable } from "./account-transactions-table";

type AccountBalanceViewProps = {
  transactions: AccountTransaction[];
  // Saldo inicial configurado de la cuenta (apertura del historial).
  openingBalance: number;
  currency: SupportedCurrencyCode;
  // Revisión de TODO el historial (no depende del mes elegido).
  review: AccountHistoryReview;
  isCash: boolean;
};

const ALL_MONTHS = "all";

type MonthOption = {
  value: string; // "YYYY-MM" o "all"
  label: string;
};

function monthLabel(date: Date): string {
  const label = date.toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dayLabel(date: Date | null): string {
  return date ? toAccountDate(date).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
}

// Recuadro "Revisión del saldo": por qué la cuenta quedó en negativo. Solo lectura.
function AccountReviewPanel({
  review,
  currency,
  isCash,
}: {
  review: AccountHistoryReview;
  currency: SupportedCurrencyCode;
  isCash: boolean;
}) {
  const money = (value: number) => formatMoney(value, currency);

  if (!review.firstNegative) {
    return (
      <div className="space-y-1 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Revisión del saldo</h2>
        <p className="text-sm text-muted-foreground">Esta cuenta nunca quedó en negativo.</p>
      </div>
    );
  }

  const first = review.firstNegative;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Revisión del saldo</h2>
        <p className="text-[11px] text-muted-foreground">Todo el historial de la cuenta, no solo el mes elegido.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Punto más bajo</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-destructive">{money(review.lowestBalance)}</p>
          <p className="text-xs text-muted-foreground">{dayLabel(review.lowestDate)}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Saldo inicial que haría falta (además del actual)</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{money(review.neededOpening)}</p>
          <p className="text-xs text-muted-foreground">Para que nunca bajara de cero</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Primer día en negativo</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{dayLabel(first.date)}</p>
          <p className="break-words text-xs text-muted-foreground">
            {first.concept} ({money(first.amount)}) dejó el saldo en {money(first.balance)}
          </p>
        </div>
      </div>

      {review.suspicious.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Salidas que quizá no salieron de aquí</p>
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>Es una pista, no una certeza: tienen señales de pago por banco. Revísalas una por una antes de moverlas.</p>
          </div>
          <ul className="space-y-1 text-sm">
            {review.suspicious.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md bg-muted/40 px-2.5 py-1.5">
                <span className="min-w-0 break-words">
                  <span className="text-muted-foreground">{dayLabel(row.date)} · </span>
                  {row.concept}
                  <span className="block text-[11px] text-muted-foreground">{row.signal}</span>
                </span>
                <span className="tabular-nums font-medium text-destructive">{money(row.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Si las salidas marcadas se pasaran a su banco, el saldo inicial que haría falta (además del actual) sería{" "}
            <span className="font-semibold tabular-nums text-foreground">{money(review.neededOpeningWithoutSuspicious)}</span>.
          </p>
        </div>
      ) : isCash ? (
        <p className="text-sm text-muted-foreground">No encontramos salidas con señales de pago por banco.</p>
      ) : null}
    </div>
  );
}

export function AccountBalanceView({ transactions, openingBalance, currency, review, isCash }: AccountBalanceViewProps) {
  // Opciones de mes: meses con transacciones + el mes actual, en orden descendente.
  const monthOptions = React.useMemo<MonthOption[]>(() => {
    const keys = new Set<string>();
    keys.add(currentBogotaMonthKey());
    for (const txn of transactions) {
      keys.add(accountMonthKey(toAccountDate(txn.date)));
    }
    const sorted = Array.from(keys).sort((a, b) => (a < b ? 1 : -1));
    return [
      { value: ALL_MONTHS, label: "Todos los meses" },
      ...sorted.map((key) => ({ value: key, label: monthLabel(accountMonthRange(key).from) })),
    ];
  }, [transactions]);

  // Por defecto: mes actual.
  const [selectedMonth, setSelectedMonth] = React.useState<string>(() => currentBogotaMonthKey());

  const range = React.useMemo(
    () => (selectedMonth === ALL_MONTHS ? null : accountMonthRange(selectedMonth)),
    [selectedMonth],
  );

  const metrics = React.useMemo(
    () => computeAccountBalanceMetrics(transactions, openingBalance, range),
    [transactions, openingBalance, range],
  );

  const filteredTransactions = React.useMemo(() => {
    if (!range) {
      return transactions;
    }
    return transactions.filter((txn) => {
      const date = toAccountDate(txn.date);
      return date >= range.from && date < range.to;
    });
  }, [transactions, range]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">Resumen del periodo</p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Periodo</span>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StatList
        items={[
          { label: "Saldo inicial", value: formatMoney(metrics.periodOpening, currency), icon: Wallet },
          { label: "Ingresos", value: formatMoney(metrics.ingreso, currency), icon: ArrowDownLeft, tone: "success" },
          { label: "Gastos", value: formatMoney(metrics.gasto, currency), icon: ArrowUpRight, tone: "danger" },
          {
            label: "Balance",
            value: formatMoney(metrics.balance, currency),
            icon: Scale,
            tone: metrics.balance >= 0 ? "success" : "danger",
          },
        ]}
      />

      <AccountReviewPanel review={review} currency={currency} isCash={isCash} />

      <AccountTransactionsTable
        data={filteredTransactions}
        openingBalance={metrics.periodOpening}
        currency={currency}
      />
    </div>
  );
}
