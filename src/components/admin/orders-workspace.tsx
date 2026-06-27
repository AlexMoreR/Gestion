"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, MoreHorizontal, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { PurchaseDirectDialog } from "@/components/admin/purchase-direct-dialog";
import { PurchaseDeleteMenuItem } from "@/components/admin/purchase-delete-menu-item";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { getOrderStatusBadgeClassName, getOrderStatusLabel } from "@/lib/orders";

type PurchaseProductOption = {
  id: string;
  name: string;
  code: string | null;
  baseCost: number;
  stock: number;
  thumbnailUrl: string;
  isBundle: boolean;
};

type OrderRow = {
  kind: "order" | "purchase";
  id: string;
  code: string;
  saleCode: string;
  clientName: string;
  assignedToName: string | null;
  total: number;
  status: "DRAFT" | "RELEASED" | "IN_PRODUCTION" | "READY_FOR_DISPATCH" | "DISPATCHED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  orderDateISO: string;
};

// Dia local (YYYY-MM-DD) de la fecha de la orden, para comparar con el rango.
function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type OrdersWorkspaceProps = {
  orders: OrderRow[];
  currency: SupportedCurrencyCode;
  stats: {
    ordersCount: number;
    activeCount: number;
    productionCount: number;
    readyToDispatchCount: number;
    completedCount: number;
  };
  purchaseProducts: PurchaseProductOption[];
  purchaseSuppliersByProduct: Record<string, { id: string; name: string; cost: number | null }[]>;
  purchaseComboComponents: Record<
    string,
    { childId: string; name: string; code: string | null; quantity: number; thumbnailUrl: string }[]
  >;
  purchaseSuppliers: { id: string; name: string }[];
};

function StatusBadge({ order }: { order: OrderRow }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${getOrderStatusBadgeClassName(order.status)}`}
    >
      {getOrderStatusLabel(order.status)}
    </span>
  );
}

function RowActions({ order }: { order: OrderRow }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones ${order.code}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/ordenes/${order.id}`}>
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Abrir
          </Link>
        </DropdownMenuItem>
        {order.kind === "order" ? (
          <DropdownMenuItem asChild>
            <Link href={`/admin/ventas`}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              Ver ventas
            </Link>
          </DropdownMenuItem>
        ) : null}
        {order.kind === "purchase" ? (
          <>
            <DropdownMenuSeparator />
            <PurchaseDeleteMenuItem orderId={order.id} code={order.code} />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrdersWorkspace({
  orders,
  currency,
  stats,
  purchaseProducts,
  purchaseSuppliersByProduct,
  purchaseComboComponents,
  purchaseSuppliers,
}: OrdersWorkspaceProps) {
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");

  const filtered = orders.filter((order) => {
    const day = localDay(order.orderDateISO);
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

  const columns: ColumnDef<OrderRow>[] = [
    {
      accessorKey: "code",
      header: "Orden",
      cell: ({ row }) => <span className="text-sm font-semibold text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: "saleCode",
      header: "Venta",
      cell: ({ row }) => <span className="text-sm text-foreground">{row.original.saleCode}</span>,
    },
    {
      accessorKey: "clientName",
      header: "Cliente",
      cell: ({ row }) => <span className="text-sm text-foreground">{row.original.clientName}</span>,
    },
    {
      accessorKey: "assignedToName",
      header: "Responsable",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.assignedToName ?? "Sin asignar"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge order={row.original} />,
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground">{formatMoney(row.original.total, currency)}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Fecha",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.createdAt}</span>,
    },
    {
      id: "acciones",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions order={row.original} />
        </div>
      ),
    },
  ];

  const renderMobileCard = (order: OrderRow) => (
    <article className="space-y-2.5 rounded-xl border border-border bg-card p-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{order.code}</p>
          <StatusBadge order={order} />
        </div>
        <p className="text-sm text-foreground">{order.saleCode}</p>
        <p className="text-sm text-foreground">{order.clientName}</p>
        <p className="text-xs text-muted-foreground">{order.assignedToName ?? "Sin asignar"}</p>
        <p className="text-sm font-semibold text-foreground">{formatMoney(order.total, currency)}</p>
        <p className="text-xs text-muted-foreground">{order.createdAt}</p>
      </div>
      <div className="flex items-center justify-end">
        <RowActions order={order} />
      </div>
    </article>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <OperationsTabs />
        </div>
        <div className="-mb-px shrink-0 pb-1.5">
          <PurchaseDirectDialog
            products={purchaseProducts}
            suppliersByProduct={purchaseSuppliersByProduct}
            comboComponents={purchaseComboComponents}
            suppliers={purchaseSuppliers}
            currency={currency}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Ordenes</p>
            <p className="text-2xl font-semibold text-foreground">{stats.ordersCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Activas</p>
            <p className="text-2xl font-semibold text-foreground">{stats.activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Produccion</p>
            <p className="text-2xl font-semibold text-foreground">{stats.productionCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Cerradas</p>
            <p className="text-2xl font-semibold text-foreground">{stats.completedCount}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        searchPlaceholder="Buscar orden, venta o cliente"
        emptyMessage="Aun no hay ordenes."
        pageSize={12}
        minWidth="min-w-[980px]"
        toolbar={dateFilter}
        searchFirst
        renderMobileCard={renderMobileCard}
      />
    </section>
  );
}
