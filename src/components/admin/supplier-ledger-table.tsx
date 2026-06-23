"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2 } from "lucide-react";
import { adminDeleteSupplierPaymentAction } from "@/app/actions/supplier-ledger-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { InventoryDataGrid } from "@/modules/inventory/presentation/components/inventory-data-grid";

export type SupplierLedgerRow = {
  id: string;
  type: "CHARGE" | "PAYMENT";
  amount: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  createdByImage: string | null;
  accountName: string | null;
  orderCode: string | null;
  code: string | null;
  receiptUrl: string | null;
};

type SupplierLedgerTableProps = {
  ledger: SupplierLedgerRow[];
  currency: SupportedCurrencyCode;
  returnTo: string;
};

export function SupplierLedgerTable({ ledger, currency, returnTo }: SupplierLedgerTableProps) {
  const columns: ColumnDef<SupplierLedgerRow, unknown>[] = [
    {
      accessorKey: "createdAt",
      header: "Fecha",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("es-CO")}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => {
        const entry = row.original;
        const reference = entry.orderCode ?? entry.code;
        return (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                entry.type === "CHARGE"
                  ? "border-destructive/30 bg-destructive/15 text-destructive"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              }
            >
              {entry.type === "CHARGE" ? "Cargo" : "Abono"}
            </Badge>
            {reference ? <span className="text-xs text-muted-foreground">{reference}</span> : null}
          </div>
        );
      },
    },
    {
      accessorKey: "note",
      header: "Detalle",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.note ?? "-"}</span>,
    },
    {
      id: "createdBy",
      header: "Registrado por",
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              {entry.createdByImage ? (
                <AvatarImage src={entry.createdByImage} alt={entry.createdByName ?? "Usuario"} />
              ) : null}
              <AvatarFallback className="text-[9px]">
                {(entry.createdByName ?? "S").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {entry.createdByName ?? "Sistema"}
              {entry.accountName ? ` - ${entry.accountName}` : ""}
            </span>
            {entry.receiptUrl ? (
              <a
                href={entry.receiptUrl}
                target="_blank"
                rel="noreferrer"
                title="Ver comprobante"
                className="inline-flex items-center text-primary transition hover:text-primary/80"
              >
                <Eye className="size-4" />
              </a>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "amount",
      header: "Monto",
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <span
            className={`text-sm font-semibold ${entry.type === "CHARGE" ? "text-red-600" : "text-emerald-600"}`}
          >
            {entry.type === "CHARGE" ? "+" : "-"}
            {formatMoney(entry.amount, currency)}
          </span>
        );
      },
    },
    {
      id: "acciones",
      header: "",
      cell: ({ row }) => {
        const entry = row.original;
        // Los cargos atados a una orden no se eliminan desde aqui.
        if (!(entry.type === "PAYMENT" || !entry.orderCode)) {
          return null;
        }
        return (
          <form
            action={adminDeleteSupplierPaymentAction}
            onSubmit={(event) => {
              if (!window.confirm(entry.type === "CHARGE" ? "¿Eliminar este cargo?" : "¿Eliminar este abono?")) {
                event.preventDefault();
              }
            }}
            className="flex justify-end"
          >
            <input type="hidden" name="paymentId" value={entry.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={entry.type === "CHARGE" ? "Eliminar cargo" : "Eliminar abono"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </form>
        );
      },
    },
  ];

  return (
    <InventoryDataGrid
      title="Movimientos"
      description="Cargos y abonos de la cuenta del proveedor."
      data={ledger}
      columns={columns}
      searchPlaceholder="Buscar movimiento"
      emptyMessage="Sin movimientos registrados."
      pageSize={12}
    />
  );
}
