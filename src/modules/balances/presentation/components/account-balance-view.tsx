"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { AccountTransaction } from "@/modules/balances/domain/entities";
import {
  accountMonthKey,
  accountMonthRange,
  computeAccountBalanceMetrics,
  currentBogotaMonthKey,
  toAccountDate,
} from "../account-balance-metrics";
import { AccountTransactionsTable } from "./account-transactions-table";

type AccountBalanceViewProps = {
  transactions: AccountTransaction[];
  // Saldo inicial configurado de la cuenta (apertura del historial).
  openingBalance: number;
  currency: SupportedCurrencyCode;
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

function SummaryCard({
  title,
  value,
  tone = "neutral",
}: {
  title: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  return (
    <Card className="border-border bg-card py-2">
      <CardContent className="space-y-0.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <p className={`text-lg font-semibold ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function AccountBalanceView({ transactions, openingBalance, currency }: AccountBalanceViewProps) {
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Saldo inicial" value={formatMoney(metrics.periodOpening, currency)} />
        <SummaryCard title="Ingresos" value={formatMoney(metrics.ingreso, currency)} tone="success" />
        <SummaryCard title="Gastos" value={formatMoney(metrics.gasto, currency)} tone="danger" />
        <SummaryCard title="Movimientos" value={formatMoney(metrics.movimientos, currency)} />
        <SummaryCard
          title="Balance"
          value={formatMoney(metrics.balance, currency)}
          tone={metrics.balance >= 0 ? "success" : "danger"}
        />
      </div>

      <AccountTransactionsTable data={filteredTransactions} currency={currency} />
    </div>
  );
}
