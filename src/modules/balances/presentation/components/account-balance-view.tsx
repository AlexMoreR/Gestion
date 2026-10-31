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
  // Revisión de todo el historial (no depende del mes elegido).
  review: AccountHistoryReview;
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

// Las fechas contables se guardan como medianoche UTC.
function dayLabel(date: Date | string): string {
  return toAccountDate(date).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function AccountReviewBox({
  review,
  openingBalance,
  currency,
}: {
  review: AccountHistoryReview;
  openingBalance: number;
  currency: SupportedCurrencyCode;
}) {
  const money = (value: number) => formatMoney(value, currency);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Revisión del saldo</h2>
        <p className="text-[11px] text-muted-foreground">Todo el historial de la cuenta, sin importar el periodo.</p>
      </div>

      {review.firstNegative ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Punto más bajo</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-destructive">{money(review.lowestBalance)}</p>
              <p className="text-xs text-muted-foreground">{review.lowestDate ? dayLabel(review.lowestDate) : "Saldo inicial"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Saldo inicial que haría falta</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{money(review.neededOpening)}</p>
              <p className="text-xs text-muted-foreground">Además del saldo inicial de hoy ({money(openingBalance)}).</p>
            </div>
          </div>

          <p className="text-sm">
            Quedó en negativo por primera vez el <span className="font-medium">{dayLabel(review.firstNegative.date)}</span>{" "}
            con «{review.firstNegative.concept}» por {money(review.firstNegative.amount)}, y el saldo pasó a{" "}
            <span className="font-medium tabular-nums text-destructive">{money(review.firstNegative.balance)}</span>.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Esta cuenta nunca quedó en negativo.</p>
      )}

      {review.suspicious.length > 0 ? (
        <div className="space-y-2">
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              <span className="font-semibold">Salidas que quizá no salieron de aquí.</span> Tienen señas de pago por banco. Es
              una pista, no una certeza: revísalas una por una.
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {review.suspicious.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md bg-muted/40 px-2.5 py-1.5">
                <span className="min-w-0 break-words">
                  <span className="text-muted-foreground">{dayLabel(row.date)}</span> · {row.concept}
                  <span className="block text-[11px] text-muted-foreground">{row.signal}</span>
                </span>
                <span className="tabular-nums font-medium text-destructive">{money(row.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm">
            Si las salidas marcadas se pasaran a su banco, el saldo inicial que haría falta sería{" "}
            <span className="font-semibold tabular-nums">{money(review.neededOpeningWithoutSuspicious)}</span>.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function AccountBalanceView({ transactions, openingBalance, currency, review }: AccountBalanceViewProps) {
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

      <AccountReviewBox review={review} openingBalance={openingBalance} currency={currency} />

      <AccountTransactionsTable
        data={filteredTransactions}
        openingBalance={metrics.periodOpening}
        currency={currency}
      />
    </div>
  );
}
