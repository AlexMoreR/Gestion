"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { ExpenseCategoryWithUsage } from "@/modules/expenses/domain/entities";
import { ExpensesDataGrid } from "./expenses-data-grid";

type ExpenseCategoriesTableProps = {
  data: ExpenseCategoryWithUsage[];
  currency: SupportedCurrencyCode;
  onEdit: (categoryId: string) => void;
  onDelete: (categoryId: string) => void;
};

export function ExpenseCategoriesTable({ data, currency, onEdit, onDelete }: ExpenseCategoriesTableProps) {
  const columns: ColumnDef<ExpenseCategoryWithUsage>[] = [
    {
      accessorKey: "name",
      header: "Categoria",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.original.name}</p>
          {row.original.description ? (
            <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
          ) : null}
          {!row.original.isActive ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">Inactiva</span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "expenseCount",
      header: "Gastos",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.expenseCount}</span>,
    },
    {
      accessorKey: "totalAmount",
      header: "Total acumulado",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-destructive">{formatMoney(row.original.totalAmount, currency)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(row.original.id)}
            aria-label="Editar categoria"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(row.original.id)}
            disabled={row.original.expenseCount > 0}
            aria-label="Eliminar categoria"
            title={row.original.expenseCount > 0 ? "No se puede eliminar: tiene gastos asociados" : "Eliminar"}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ExpensesDataGrid
      title="Categorias de gasto"
      description="Administra las categorias en las que clasificas tus gastos."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar categoria"
      emptyMessage="Aun no hay categorias. Crea la primera con 'Nueva categoria'."
      pageSize={8}
    />
  );
}
