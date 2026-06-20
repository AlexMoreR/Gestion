"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { InventoryMovementRow, InventoryMovementType } from "@/modules/inventory/domain/entities";
import { InventoryDataGrid } from "./inventory-data-grid";

type MovementsTableProps = {
  data: InventoryMovementRow[];
};

const TYPE_BADGE: Record<InventoryMovementType, { label: string; className: string }> = {
  IN: {
    label: "Entrada",
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  OUT: {
    label: "Salida",
    className: "border-destructive/30 bg-destructive/15 text-destructive",
  },
  ADJUSTMENT: {
    label: "Ajuste",
    className: "border-primary/30 bg-primary/15 text-primary",
  },
};

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" });
}

export function MovementsTable({ data }: MovementsTableProps) {
  const columns: ColumnDef<InventoryMovementRow>[] = [
    {
      accessorKey: "movementDate",
      header: "Fecha",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.movementDate)}</span>,
    },
    {
      accessorKey: "productName",
      header: "Producto",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.original.productName}</p>
          {row.original.productCode ? (
            <p className="truncate text-xs text-muted-foreground">{row.original.productCode}</p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => {
        const badge = TYPE_BADGE[row.original.type];
        return (
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "change",
      header: "Cambio",
      cell: ({ row }) => (
        <span
          className={`text-sm font-semibold ${
            row.original.change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
          }`}
        >
          {row.original.change >= 0 ? `+${row.original.change}` : row.original.change}
        </span>
      ),
    },
    {
      accessorKey: "note",
      header: "Nota",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.note ?? "-"}</span>
      ),
    },
  ];

  return (
    <InventoryDataGrid
      title="Historial de movimientos"
      description="Entradas, salidas y ajustes registrados en el inventario."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar movimiento"
      emptyMessage="Aun no hay movimientos de inventario."
      pageSize={12}
    />
  );
}
