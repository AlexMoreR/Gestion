"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Truck } from "lucide-react";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { SaleProfit } from "@/modules/balances/domain/entities";
import { BalancesDataGrid } from "./balances-data-grid";
import { displayCode } from "@/lib/code-display";

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
          <p className="text-sm font-medium text-foreground">{displayCode(row.original.saleCode)}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString("es-CO")}
          </p>
          {row.original.pendingDelivery ? (
            <span
              className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
              title="Pagada por completo: ya cuenta su ganancia y solo falta entregarla."
            >
              <Truck className="h-3.5 w-3.5" />
              Falta entregar
            </span>
          ) : null}
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
      description="Ventas pagadas por completo. Las que dicen “Falta entregar” ya cuentan su ganancia; solo queda la entrega."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar por venta o cliente"
      emptyMessage="No hay ventas para analizar."
      paginate={false}
    />
  );
}
