import Link from "next/link";
import { ArrowUpRight, CheckCircle2, PackageCheck, Truck, Wallet, XCircle } from "lucide-react";
import { adminUpdateDispatchStatusAction } from "@/app/actions/dispatch-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { DispatchReviewButton, type DispatchReviewData } from "@/components/admin/dispatch-review-button";
import {
  getDispatchStatusBadgeClassName,
  getDispatchStatusLabel,
  getOrderStatusBadgeClassName,
  getOrderStatusLabel,
} from "@/lib/orders";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { OrderStatus } from "@prisma/client";

type DispatchRow = DispatchReviewData & {
  orderId: string;
};

type PaidNotDispatchedRow = {
  saleId: string;
  saleCode: string;
  clientName: string;
  total: number;
  paidAt: string | null;
  orderId: string | null;
  orderCode: string | null;
  orderStatus: OrderStatus | null;
};

type DispatchesWorkspaceProps = {
  dispatches: DispatchRow[];
  currency: SupportedCurrencyCode;
  paidNotDispatched: PaidNotDispatchedRow[];
  stats: {
    dispatchesCount: number;
    pendingCount: number;
    shippedCount: number;
    deliveredCount: number;
  };
};

function DispatchActions({ dispatch }: { dispatch: DispatchRow }) {
  const canPack = dispatch.status === "PENDING" || dispatch.status === "RETURNED";
  const canShip = dispatch.status === "PACKING";
  const canDeliver = dispatch.status === "SHIPPED";
  const canCancel = dispatch.status !== "DELIVERED" && dispatch.status !== "CANCELLED";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPack ? (
        <form action={adminUpdateDispatchStatusAction}>
          <input type="hidden" name="returnTo" value="/admin/despachos" />
          <input type="hidden" name="dispatchId" value={dispatch.id} />
          <input type="hidden" name="status" value="PACKING" />
          <Button type="submit" variant="outline" size="sm" className="h-7">
            <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
            Empacar
          </Button>
        </form>
      ) : null}
      {canShip ? (
        <form action={adminUpdateDispatchStatusAction}>
          <input type="hidden" name="returnTo" value="/admin/despachos" />
          <input type="hidden" name="dispatchId" value={dispatch.id} />
          <input type="hidden" name="status" value="SHIPPED" />
          <Button type="submit" variant="outline" size="sm" className="h-7">
            <Truck className="mr-1.5 h-3.5 w-3.5" />
            Despachar
          </Button>
        </form>
      ) : null}
      {canDeliver ? (
        <form action={adminUpdateDispatchStatusAction}>
          <input type="hidden" name="returnTo" value="/admin/despachos" />
          <input type="hidden" name="dispatchId" value={dispatch.id} />
          <input type="hidden" name="status" value="DELIVERED" />
          <Button type="submit" size="sm" className="h-7 bg-emerald-600 text-white hover:bg-emerald-600/90">
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Entregar
          </Button>
        </form>
      ) : null}
      {canCancel ? (
        <form action={adminUpdateDispatchStatusAction}>
          <input type="hidden" name="returnTo" value="/admin/despachos" />
          <input type="hidden" name="dispatchId" value={dispatch.id} />
          <input type="hidden" name="status" value="CANCELLED" />
          <Button type="submit" variant="destructive" size="sm" className="h-7">
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Cancelar
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function DispatchesWorkspace({ dispatches, currency, paidNotDispatched, stats }: DispatchesWorkspaceProps) {
  return (
    <section className="space-y-4">
      <OperationsTabs />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card className={paidNotDispatched.length > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card/95"}>
          <CardContent className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Pagadas sin despachar
            </p>
            <p className={`text-2xl font-semibold ${paidNotDispatched.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {paidNotDispatched.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Despachos</p>
            <p className="text-2xl font-semibold text-foreground">{stats.dispatchesCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Pendientes</p>
            <p className="text-2xl font-semibold text-foreground">{stats.pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">En camino</p>
            <p className="text-2xl font-semibold text-foreground">{stats.shippedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Entregados</p>
            <p className="text-2xl font-semibold text-foreground">{stats.deliveredCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Pagadas pendientes de despachar</h2>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {paidNotDispatched.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Ventas que el cliente ya pago al 100% y aun no tienen un despacho enviado o entregado.
        </p>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Venta</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Total pagado</TableHead>
                <TableHead>Ultimo pago</TableHead>
                <TableHead>Estado de la orden</TableHead>
                <TableHead className="text-right">Accion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paidNotDispatched.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-9 text-center text-muted-foreground">
                    No hay ventas pagadas pendientes de despachar.
                  </TableCell>
                </TableRow>
              ) : (
                paidNotDispatched.map((sale) => (
                  <TableRow key={sale.saleId}>
                    <TableCell className="text-sm font-semibold text-foreground">{sale.saleCode}</TableCell>
                    <TableCell className="text-sm text-foreground">{sale.clientName}</TableCell>
                    <TableCell className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {formatMoney(sale.total, currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{sale.paidAt ?? "-"}</TableCell>
                    <TableCell>
                      {sale.orderStatus ? (
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${getOrderStatusBadgeClassName(sale.orderStatus)}`}
                        >
                          {getOrderStatusLabel(sale.orderStatus)}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-md border border-amber-500/40 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          Sin orden
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {sale.orderId ? (
                        <Link
                          href={`/admin/ordenes/${sale.orderId}`}
                          className="inline-flex items-center gap-1 text-sm text-foreground hover:underline"
                        >
                          Ver orden
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                      ) : (
                        <Link
                          href={`/admin/ventas?q=${encodeURIComponent(sale.saleCode)}`}
                          className="inline-flex items-center gap-1 text-sm text-foreground hover:underline"
                        >
                          Ver venta
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Despacho</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Transportadora</TableHead>
              <TableHead>Guia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dispatches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-9 text-center text-muted-foreground">
                  Aun no hay despachos.
                </TableCell>
              </TableRow>
            ) : (
              dispatches.map((dispatch) => (
                <TableRow key={dispatch.id}>
                  <TableCell className="text-sm font-semibold text-foreground">{dispatch.code}</TableCell>
                  <TableCell>
                    <Link href={`/admin/ordenes/${dispatch.orderId}`} className="inline-flex items-center gap-1 text-sm text-foreground hover:underline">
                      {dispatch.orderCode}
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{dispatch.clientName}</TableCell>
                  <TableCell className="text-sm text-foreground">{dispatch.carrierName ?? "-"}</TableCell>
                  <TableCell className="text-sm text-foreground">{dispatch.trackingNumber ?? "-"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${getDispatchStatusBadgeClassName(dispatch.status)}`}
                    >
                      {getDispatchStatusLabel(dispatch.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dispatch.createdAt}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <DispatchReviewButton dispatch={dispatch} currency={currency} />
                      <DispatchActions dispatch={dispatch} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
