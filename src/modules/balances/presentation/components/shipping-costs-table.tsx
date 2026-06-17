"use client";

import { PencilLine, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { ShippingCostRow } from "@/modules/balances/domain/entities";
import { BalancesDataGrid } from "./balances-data-grid";

type ShippingCostsTableProps = {
  data: ShippingCostRow[];
  currency: SupportedCurrencyCode;
  onEdit: (shippingCostId: string) => void;
  onDelete: (shippingCostId: string) => void;
};

export function ShippingCostsTable({ data, currency, onEdit, onDelete }: ShippingCostsTableProps) {
  const columns: ColumnDef<ShippingCostRow>[] = [
    {
      accessorKey: "paymentDate",
      header: "Fecha",
      cell: ({ row }) => new Date(row.original.paymentDate).toLocaleDateString("es-CO"),
    },
    {
      accessorKey: "shippingProvider",
      header: "Transportador",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-foreground">{row.original.shippingProvider}</p>
          <p className="text-xs text-muted-foreground">Venta {row.original.saleCode}</p>
        </div>
      ),
    },
    {
      accessorKey: "transactionReference",
      header: "Referencia",
      cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.transactionReference}</span>,
    },
    {
      accessorKey: "amount",
      header: "Valor",
      cell: ({ row }) => <span className="text-sm font-semibold text-foreground">{formatMoney(row.original.amount, currency)}</span>,
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onEdit(row.original.id)} aria-label="Editar costo">
            <PencilLine className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(row.original.id)}
            aria-label="Eliminar costo"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <BalancesDataGrid
      title="Costos de envio"
      description="Movimientos logistico-financieros asociados a ventas."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar por transportador, venta o referencia"
      emptyMessage="No hay costos de envio registrados."
    />
  );
}
