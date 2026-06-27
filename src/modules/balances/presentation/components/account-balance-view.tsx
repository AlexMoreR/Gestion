"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { AccountTransaction } from "@/modules/balances/domain/entities";
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

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  const label = date.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Limites [from, to) del mes a partir de su clave "YYYY-MM".
function monthRange(key: string): { from: Date; to: Date } {
  const [year, month] = key.split("-").map(Number);
  return { from: new Date(year, month - 1, 1), to: new Date(year, month, 1) };
}

type Metrics = {
  periodOpening: number;
  ingreso: number;
  gasto: number;
  movimientos: number;
  balance: number;
};

// Misma logica que summarizeAccountBalance, pero a partir de las transacciones.
function computeMetrics(
  transactions: AccountTransaction[],
  openingBalance: number,
  range: { from: Date; to: Date } | null,
): Metrics {
  let periodOpening = openingBalance;
  let ingreso = 0;
  let gasto = 0;
  let movimientos = 0;

  for (const txn of transactions) {
    const date = toDate(txn.date);
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
    keys.add(monthKey(new Date()));
    for (const txn of transactions) {
      keys.add(monthKey(toDate(txn.date)));
    }
    const sorted = Array.from(keys).sort((a, b) => (a < b ? 1 : -1));
    return [
      { value: ALL_MONTHS, label: "Todos los meses" },
      ...sorted.map((key) => ({ value: key, label: monthLabel(monthRange(key).from) })),
    ];
  }, [transactions]);

  // Por defecto: mes actual.
  const [selectedMonth, setSelectedMonth] = React.useState<string>(() => monthKey(new Date()));

  const range = selectedMonth === ALL_MONTHS ? null : monthRange(selectedMonth);

  const metrics = React.useMemo(
    () => computeMetrics(transactions, openingBalance, range),
    [transactions, openingBalance, selectedMonth],
  );

  const filteredTransactions = React.useMemo(() => {
    if (!range) {
      return transactions;
    }
    return transactions.filter((txn) => {
      const date = toDate(txn.date);
      return date >= range.from && date < range.to;
    });
  }, [transactions, selectedMonth]);

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
