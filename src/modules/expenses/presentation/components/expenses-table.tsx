"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Paperclip, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ReceiptLightbox } from "@/components/ui/receipt-lightbox";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { ExpenseRow } from "@/modules/expenses/domain/entities";
import { ExpensesDataGrid } from "./expenses-data-grid";

type ExpensesTableProps = {
  data: ExpenseRow[];
  currency: SupportedCurrencyCode;
  onEdit: (expenseId: string) => void;
  onDelete: (expenseId: string) => void;
  // Rango de fechas controlado por el contenedor, para sincronizar la tabla con
  // el panel "Gasto por categoria". La data ya llega filtrada.
  fromDate: string;
  toDate: string;
  onDateChange: (range: { from: string; to: string }) => void;
};

// La fecha del gasto es un dia de calendario guardado como medianoche UTC; se
// formatea en UTC para mostrar el mismo dia que se eligio, sin desfase horario.
function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ExpensesTable({ data, currency, onEdit, onDelete, fromDate, toDate, onDateChange }: ExpensesTableProps) {
  const [actionsRow, setActionsRow] = React.useState<ExpenseRow | null>(null);
  const [receiptUrl, setReceiptUrl] = React.useState<string | null>(null);

  const dateFilter = (
    <div className="flex items-center gap-1.5">
      <DateRangePicker
        from={fromDate}
        to={toDate}
        onChange={onDateChange}
        aria-label="Rango de fechas"
        className="sm:w-64"
        placeholder="Rango de fechas"
      />
      {fromDate || toDate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onDateChange({ from: "", to: "" })}
          aria-label="Limpiar fechas"
          title="Limpiar fechas"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );

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
        <div className="min-w-0 max-w-[220px]">
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
      accessorKey: "amount",
      header: "Monto",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-destructive">{formatMoney(row.original.amount, currency)}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.accountName}</p>
        </div>
      ),
    },
  ];

  return (
    <>
      <ExpensesDataGrid
        data={data}
        columns={columns}
        searchPlaceholder="Buscar gasto"
        emptyMessage="Aun no hay gastos. Registra el primero con 'Nuevo gasto'."
        pageSize={10}
        toolbar={dateFilter}
        searchFirst
        paginate={false}
        onRowClick={(row) => setActionsRow(row)}
      />

      <Dialog open={Boolean(actionsRow)} onOpenChange={(open) => (open ? null : setActionsRow(null))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Acciones del gasto</DialogTitle>
          </DialogHeader>
          {actionsRow ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">
                  {actionsRow.description || "Sin descripcion"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {actionsRow.categoryName} · {formatMoney(actionsRow.amount, currency)}
                </p>
              </div>

              {actionsRow.receiptUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setReceiptUrl(actionsRow.receiptUrl);
                    setActionsRow(null);
                  }}
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  Ver comprobante
                </Button>
              ) : null}

              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  const id = actionsRow.id;
                  setActionsRow(null);
                  onEdit(id);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={() => {
                  const id = actionsRow.id;
                  setActionsRow(null);
                  onDelete(id);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReceiptLightbox url={receiptUrl} onClose={() => setReceiptUrl(null)} />
    </>
  );
}
