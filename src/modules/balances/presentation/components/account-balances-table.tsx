"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { AccountBalance, AccountType } from "@/modules/balances/domain/entities";
import { BalancesDataGrid } from "./balances-data-grid";

type AccountBalancesTableProps = {
  data: AccountBalance[];
  currency: SupportedCurrencyCode;
  onEdit: (accountId: string) => void;
};

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CASH: "Efectivo",
  BANK: "Banco",
  WALLET: "Billetera",
  OTHER: "Otro",
};

export function AccountBalancesTable({ data, currency, onEdit }: AccountBalancesTableProps) {
  const columns: ColumnDef<AccountBalance>[] = [
    {
      accessorKey: "name",
      header: "Cuenta",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.original.name}</p>
          {row.original.reference ? (
            <p className="truncate text-xs text-muted-foreground">{row.original.reference}</p>
          ) : null}
          {!row.original.isActive ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">Inactiva</span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{ACCOUNT_TYPE_LABEL[row.original.type]}</span>
      ),
    },
    {
      accessorKey: "openingBalance",
      header: "Saldo inicial",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatMoney(row.original.openingBalance, currency)}</span>
      ),
    },
    {
      accessorKey: "ingreso",
      header: "Ingresos",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          {formatMoney(row.original.ingreso, currency)}
        </span>
      ),
    },
    {
      accessorKey: "gasto",
      header: "Gastos",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-destructive">{formatMoney(row.original.gasto, currency)}</span>
      ),
    },
    {
      accessorKey: "movimientos",
      header: "Movimientos",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatMoney(row.original.movimientos, currency)}</span>
      ),
    },
    {
      accessorKey: "balance",
      header: "Balance",
      cell: ({ row }) => (
        <span className={`text-sm font-semibold ${row.original.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {formatMoney(row.original.balance, currency)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit(row.original.id)}
          aria-label={`Editar ${row.original.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <BalancesDataGrid
      title="Cuentas y balance"
      description="Saldo real por cuenta: saldo inicial + ingresos - gastos +/- movimientos."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar cuenta"
      emptyMessage="Aun no hay cuentas. Crea la primera con 'Nueva cuenta'."
      pageSize={8}
    />
  );
}
