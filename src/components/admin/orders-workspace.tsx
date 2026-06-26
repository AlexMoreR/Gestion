import Link from "next/link";
import { ArrowUpRight, MoreHorizontal, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { PurchaseDirectDialog } from "@/components/admin/purchase-direct-dialog";
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
  id: string;
  code: string;
  saleCode: string;
  clientName: string;
  assignedToName: string | null;
  total: number;
  status: "DRAFT" | "RELEASED" | "IN_PRODUCTION" | "READY_FOR_DISPATCH" | "DISPATCHED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
};

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
};

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
        <DropdownMenuItem asChild>
          <Link href={`/admin/ventas`}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Ver ventas
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/admin/ordenes/${order.id}`}>
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Detalle
          </Link>
        </DropdownMenuItem>
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
}: OrdersWorkspaceProps) {
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

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Orden</TableHead>
              <TableHead>Venta</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="sr-only">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-9 text-center text-muted-foreground">
                  Aun no hay ordenes.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className="[&_td]:py-1">
                  <TableCell>
                    <p className="text-sm font-semibold text-foreground">{order.code}</p>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{order.saleCode}</TableCell>
                  <TableCell className="text-sm text-foreground">{order.clientName}</TableCell>
                  <TableCell className="text-sm text-foreground">{order.assignedToName ?? "Sin asignar"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${getOrderStatusBadgeClassName(order.status)}`}
                    >
                      {getOrderStatusLabel(order.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">
                    {formatMoney(order.total, currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{order.createdAt}</TableCell>
                  <TableCell>
                    <RowActions order={order} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {orders.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            Aun no hay ordenes.
          </div>
        ) : (
          orders.map((order) => (
            <article key={order.id} className="space-y-2.5 rounded-xl border border-border bg-card p-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{order.code}</p>
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${getOrderStatusBadgeClassName(order.status)}`}
                  >
                    {getOrderStatusLabel(order.status)}
                  </span>
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
          ))
        )}
      </div>
    </section>
  );
}
