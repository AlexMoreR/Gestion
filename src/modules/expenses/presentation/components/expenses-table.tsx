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
  // Si es true, el rango de fechas arranca filtrado al mes en curso.
  defaultCurrentMonth?: boolean;
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

// Dia (YYYY-MM-DD) en UTC para comparar con el DateRangePicker.
function utcDay(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

// Primer y ultimo dia del mes en curso, en formato YYYY-MM-DD. Se calcula en
// hora de Colombia (UTC-5) para que la noche del ultimo dia del mes no salte al
// mes siguiente (como pasaria usando UTC directo).
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const bogotaNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const year = bogotaNow.getUTCFullYear();
  const month = bogotaNow.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

export function ExpensesTable({ data, currency, onEdit, onDelete, defaultCurrentMonth = false }: ExpensesTableProps) {
  const initialRange = defaultCurrentMonth ? currentMonthRange() : { from: "", to: "" };
  const [fromDate, setFromDate] = React.useState(initialRange.from);
  const [toDate, setToDate] = React.useState(initialRange.to);
  const [actionsRow, setActionsRow] = React.useState<ExpenseRow | null>(null);
  const [receiptUrl, setReceiptUrl] = React.useState<string | null>(null);

  const filtered = data.filter((expense) => {
    const day = utcDay(expense.expenseDate);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    return true;
  });

  const dateFilter = (
    <div className="flex items-center gap-1.5">
      <DateRangePicker
        from={fromDate}
        to={toDate}
        onChange={(range) => {
          setFromDate(range.from);
          setToDate(range.to);
        }}
        aria-label="Rango de fechas"
        className="sm:w-64"
        placeholder="Rango de fechas"
      />
      {fromDate || toDate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setFromDate("");
            setToDate("");
          }}
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
        data={filtered}
        columns={columns}
        searchPlaceholder="Buscar gasto"
        emptyMessage="Aun no hay gastos. Registra el primero con 'Nuevo gasto'."
        pageSize={10}
        toolbar={dateFilter}
        searchFirst
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
