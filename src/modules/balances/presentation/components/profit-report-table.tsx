"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { SaleProfit } from "@/modules/balances/domain/entities";
import { BalancesDataGrid } from "./balances-data-grid";

type ProfitReportTableProps = {
  data: SaleProfit[];
  currency: SupportedCurrencyCode;
};

export function ProfitReportTable({ data, currency }: ProfitReportTableProps) {
  const columns: ColumnDef<SaleProfit>[] = [
    {
      accessorKey: "saleCode",
      header: "Venta",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-foreground">{row.original.saleCode}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString("es-CO")}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "clientName",
      header: "Cliente",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.clientName ?? "Sin cliente"}</span>,
    },
    {
      accessorKey: "saleAmount",
      header: "Venta",
      cell: ({ row }) => <span className="font-semibold text-foreground">{formatMoney(row.original.saleAmount, currency)}</span>,
    },
    {
      accessorKey: "supplierCosts",
      header: "Costos proveedor",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatMoney(row.original.supplierCosts, currency)}</span>,
    },
    {
      accessorKey: "shippingCosts",
      header: "Envio",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatMoney(row.original.shippingCosts, currency)}</span>,
    },
    {
      accessorKey: "netProfit",
      header: "Ganancia neta",
      cell: ({ row }) => (
        <span className={row.original.netProfit >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-destructive"}>
          {formatMoney(row.original.netProfit, currency)}
        </span>
      ),
    },
    {
      accessorKey: "marginPercentage",
      header: "Margen %",
      cell: ({ row }) => (
        <span className={row.original.marginPercentage >= 0 ? "font-medium text-foreground" : "font-medium text-destructive"}>
          {row.original.marginPercentage.toFixed(2)}%
        </span>
      ),
    },
  ];

  return (
    <BalancesDataGrid
      title="Balance por venta"
      description="Rentabilidad calculada por orden/venta."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar por venta o cliente"
      emptyMessage="No hay ventas para analizar."
      pageSize={6}
    />
  );
}
