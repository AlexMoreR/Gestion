"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { SupplierBalance } from "@/modules/balances/domain/entities";
import { BalancesDataGrid } from "./balances-data-grid";

type SupplierBalancesTableProps = {
  data: SupplierBalance[];
  currency: SupportedCurrencyCode;
};

export function SupplierBalancesTable({ data, currency }: SupplierBalancesTableProps) {
  const columns: ColumnDef<SupplierBalance>[] = [
    {
      accessorKey: "supplierName",
      header: "Proveedor",
      cell: ({ row }) => <span className="text-sm font-medium text-foreground">{row.original.supplierName}</span>,
    },
    {
      accessorKey: "paymentCount",
      header: "Pagos",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.paymentCount}</span>,
    },
    {
      accessorKey: "totalPaid",
      header: "Total pagado",
      cell: ({ row }) => <span className="font-semibold text-foreground">{formatMoney(row.original.totalPaid, currency)}</span>,
    },
    {
      accessorKey: "lastPaymentAt",
      header: "Ultimo pago",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.lastPaymentAt ? new Date(row.original.lastPaymentAt).toLocaleDateString("es-CO") : "Sin pagos"}
        </span>
      ),
    },
    {
      accessorKey: "lastSaleCode",
      header: "Venta",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.lastSaleCode ?? "-"}</span>,
    },
  ];

  return (
    <BalancesDataGrid
      title="Acumulado por proveedor"
      description="Cuantos pagos lleva cada proveedor y cuanto se le ha girado."
      data={data}
      columns={columns}
      searchPlaceholder="Buscar proveedor"
      emptyMessage="No hay proveedores con pagos registrados."
      pageSize={6}
    />
  );
}
