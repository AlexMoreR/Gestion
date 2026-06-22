"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { AccountBalance } from "@/modules/balances/domain/entities";
import { BalancesDataGrid } from "./balances-data-grid";

type AccountBalancesTableProps = {
  data: AccountBalance[];
  currency: SupportedCurrencyCode;
  onEdit: (accountId: string) => void;
};

const accountHref = (accountId: string) => `/admin/balances/cuentas/${accountId}`;

export function AccountBalancesTable({ data, currency, onEdit }: AccountBalancesTableProps) {
  const columns: ColumnDef<AccountBalance>[] = [
    {
      accessorKey: "name",
      header: "Cuenta",
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={accountHref(row.original.id)}
            className="truncate text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
          >
            {row.original.name}
          </Link>
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
        <div className="flex items-center justify-end gap-1">
          <Link
            href={accountHref(row.original.id)}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label={`Ver transacciones de ${row.original.name}`}
          >
            <Eye className="h-4 w-4" />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(row.original.id)}
            aria-label={`Editar ${row.original.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
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
