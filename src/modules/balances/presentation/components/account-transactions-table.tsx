"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { AccountTransaction, AccountTransactionType } from "@/modules/balances/domain/entities";
import { BalancesDataGrid } from "./balances-data-grid";

type AccountTransactionsTableProps = {
  data: AccountTransaction[];
  currency: SupportedCurrencyCode;
};

const TYPE_LABEL: Record<AccountTransactionType, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Gasto",
  MOVEMENT_IN: "Movimiento (entra)",
  MOVEMENT_OUT: "Movimiento (sale)",
};

function isImageReceipt(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(url.split("?")[0] ?? "");
}

export function AccountTransactionsTable({ data, currency }: AccountTransactionsTableProps) {
  const [selected, setSelected] = React.useState<AccountTransaction | null>(null);

  const columns: ColumnDef<AccountTransaction>[] = [
    {
      accessorKey: "date",
      header: "Fecha",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.date).toLocaleDateString("es-CO")}
        </span>
      ),
    },
    {
      accessorKey: "concept",
      header: "Concepto",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-foreground">{row.original.concept}</span>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{TYPE_LABEL[row.original.type]}</span>
      ),
    },
    {
      accessorKey: "reference",
      header: "Referencia",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.reference ?? "-"}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Monto",
      cell: ({ row }) => {
        const isPositive = row.original.amount >= 0;
        return (
          <span
            className={`inline-flex items-center gap-1 text-sm font-semibold ${
              isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            }`}
          >
            {isPositive ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
            {isPositive ? "+" : "-"}
            {formatMoney(Math.abs(row.original.amount), currency)}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <BalancesDataGrid
        title="Transacciones"
        data={data}
        columns={columns}
        searchPlaceholder="Buscar transaccion"
        emptyMessage="Esta cuenta aun no tiene transacciones registradas."
        paginate={false}
        onRowClick={setSelected}
        getRowDate={(row) => (row.date ? new Date(row.date).toISOString() : null)}
      />

      <TransactionDetailDialog transaction={selected} currency={currency} onClose={() => setSelected(null)} />
    </>
  );
}

function TransactionDetailDialog({
  transaction,
  currency,
  onClose,
}: {
  transaction: AccountTransaction | null;
  currency: SupportedCurrencyCode;
  onClose: () => void;
}) {
  if (!transaction) {
    return null;
  }

  const isPositive = transaction.amount >= 0;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de transaccion"
      onClick={onClose}
    >
      <Card className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">{transaction.concept}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(transaction.date).toLocaleDateString("es-CO")} · {TYPE_LABEL[transaction.type]}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <dl className="space-y-3">
            <DetailRow label="Concepto" value={transaction.concept} />
            <DetailRow label="Referencia" value={transaction.reference ?? "-"} />
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground">Monto</dt>
              <dd
                className={`text-base font-semibold ${
                  isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                }`}
              >
                {isPositive ? "+" : "-"}
                {formatMoney(Math.abs(transaction.amount), currency)}
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Comprobante</p>
            {transaction.receiptUrl ? (
              isImageReceipt(transaction.receiptUrl) ? (
                <a href={transaction.receiptUrl} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={transaction.receiptUrl}
                    alt={transaction.receiptName ?? "Comprobante"}
                    className="max-h-80 w-full rounded-xl border border-border object-contain"
                  />
                </a>
              ) : (
                <a
                  href={transaction.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3 transition hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm text-foreground">{transaction.receiptName ?? "Ver comprobante"}</span>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              )
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Esta transaccion no tiene comprobante.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-border px-4 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
