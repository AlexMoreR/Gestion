"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Paperclip, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { ExpenseRow } from "@/modules/expenses/domain/entities";
import { ExpensesDataGrid } from "./expenses-data-grid";

type ExpensesTableProps = {
  data: ExpenseRow[];
  currency: SupportedCurrencyCode;
  onEdit: (expenseId: string) => void;
  onDelete: (expenseId: string) => void;
};

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" });
}

export function ExpensesTable({ data, currency, onEdit, onDelete }: ExpensesTableProps) {
  const columns: ColumnDef<ExpenseRow>[] = [
    {
      accessorKey: "expenseDate",
      header: "Fecha",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.expenseDate)}</span>,
    },
    {
      accessorKey: "categoryName",
      header: "Categoria",
      cell: ({ row }) => (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {row.original.categoryName}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "Detalle",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{row.original.description ?? "Sin descripcion"}</p>
          {row.original.employeeName ? (
            <p className="truncate text-xs text-muted-foreground">Empleado: {row.original.employeeName}</p>
          ) : null}
          {row.original.reference ? (
            <p className="truncate text-xs text-muted-foreground">Ref: {row.original.reference}</p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "accountName",
      header: "Cuenta",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.accountName}</span>,
    },
    {
      accessorKey: "amount",
      header: "Monto",
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-destructive">{formatMoney(row.original.amount, currency)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {row.original.receiptUrl ? (
            <a
              href={row.original.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Ver comprobante"
              title="Ver comprobante"
            >
              <Paperclip className="h-4 w-4" />
            </a>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(row.original.id)}
            aria-label="Editar gasto"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(row.original.id)}
            aria-label="Eliminar gasto"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ExpensesDataGrid
      title="Gastos registrados"
      description="Cada gasto descuenta del balance de la cuenta seleccionada."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar gasto"
      emptyMessage="Aun no hay gastos. Registra el primero con 'Nuevo gasto'."
      pageSize={10}
    />
  );
}
