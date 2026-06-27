"use client";

import { Paperclip, PencilLine, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { PaymentHistoryRow } from "@/modules/balances/domain/entities";
import { BalancesDataGrid } from "./balances-data-grid";

type PaymentHistoryTableProps = {
  data: PaymentHistoryRow[];
  currency: SupportedCurrencyCode;
  onEdit: (paymentId: string) => void;
  onDelete: (paymentId: string) => void;
};

export function PaymentHistoryTable({ data, currency, onEdit, onDelete }: PaymentHistoryTableProps) {
  const columns: ColumnDef<PaymentHistoryRow>[] = [
    {
      accessorKey: "paymentDate",
      header: "Fecha",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {new Date(row.original.paymentDate).toLocaleDateString("es-CO")}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString("es-CO")}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "supplierName",
      header: "Proveedor",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-foreground">{row.original.supplierName}</p>
          <p className="text-xs text-muted-foreground">Venta {row.original.saleCode ?? "sin venta"}</p>
        </div>
      ),
    },
    {
      accessorKey: "transactionReference",
      header: "Referencia",
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.transactionReference}</span>,
    },
    {
      accessorKey: "saleTotal",
      header: "Valor venta",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.saleTotal !== null ? formatMoney(row.original.saleTotal, currency) : "Sin dato"}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Valor",
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground">
          {formatMoney(row.original.amount, currency)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Acciones",
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
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onEdit(row.original.id)} aria-label="Editar pago">
            <PencilLine className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(row.original.id)}
            aria-label="Eliminar pago"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <BalancesDataGrid
      title="Historial de pagos"
      description="Pagos a proveedores con busqueda, ordenamiento y paginacion."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar por proveedor, venta o referencia"
      emptyMessage="No hay pagos registrados."
      getRowDate={(row) => (row.paymentDate ? new Date(row.paymentDate).toISOString() : null)}
    />
  );
}
