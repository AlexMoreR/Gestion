"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownUp, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProductStock, StockStatus } from "@/modules/inventory/domain/entities";
import { InventoryDataGrid } from "./inventory-data-grid";

type ProductStockTableProps = {
  data: ProductStock[];
  onMove: (productId: string) => void;
  onEditMin: (productId: string) => void;
};

const STATUS_BADGE: Record<StockStatus, { label: string; className: string }> = {
  OK: {
    label: "Disponible",
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  LOW: {
    label: "Bajo stock",
    className: "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  OUT: {
    label: "Agotado",
    className: "border-destructive/30 bg-destructive/15 text-destructive",
  },
};

function formatDate(value: Date | null): string {
  if (!value) {
    return "Sin movimientos";
  }
  return new Date(value).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" });
}

export function ProductStockTable({ data, onMove, onEditMin }: ProductStockTableProps) {
  const columns: ColumnDef<ProductStock>[] = [
    {
      accessorKey: "name",
      header: "Producto",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.original.name}</p>
          {row.original.code ? (
            <p className="truncate text-xs text-muted-foreground">{row.original.code}</p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "stock",
      header: "Stock",
      cell: ({ row }) => (
        <span
          className={`text-sm font-semibold ${
            row.original.status === "OUT"
              ? "text-destructive"
              : row.original.status === "LOW"
                ? "text-amber-600 dark:text-amber-400"
                : "text-foreground"
          }`}
        >
          {row.original.stock}
        </span>
      ),
    },
    {
      accessorKey: "minStock",
      header: "Minimo",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.minStock}</span>,
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => {
        const badge = STATUS_BADGE[row.original.status];
        return (
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "lastMovementAt",
      header: "Ultimo movimiento",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.lastMovementAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onMove(row.original.productId)}
          >
            <ArrowDownUp className="h-4 w-4" />
            Mover
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEditMin(row.original.productId)}
            aria-label="Editar stock minimo"
            title="Editar stock minimo"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <InventoryDataGrid
      title="Stock por producto"
      description="Existencias actuales de los productos tipo Stock. Los combos no manejan inventario."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar producto"
      emptyMessage="No hay productos tipo Stock. Crea uno o cambia su modo de cumplimiento a 'Stock'."
      pageSize={12}
    />
  );
}
