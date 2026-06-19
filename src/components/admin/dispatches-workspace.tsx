import Link from "next/link";
import { ArrowUpRight, CheckCircle2, PackageCheck, Truck, XCircle } from "lucide-react";
import { adminUpdateDispatchStatusAction } from "@/app/actions/dispatch-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { getDispatchStatusBadgeClassName, getDispatchStatusLabel } from "@/lib/orders";

type DispatchRow = {
  id: string;
  code: string;
  orderCode: string;
  orderId: string;
  clientName: string;
  carrierName: string | null;
  trackingNumber: string | null;
  status: "PENDING" | "PACKING" | "SHIPPED" | "DELIVERED" | "RETURNED" | "CANCELLED";
  createdAt: string;
};

type DispatchesWorkspaceProps = {
  dispatches: DispatchRow[];
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

export function DispatchesWorkspace({ dispatches, stats }: DispatchesWorkspaceProps) {
  return (
    <section className="space-y-4">
      <OperationsTabs />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                    <DispatchActions dispatch={dispatch} />
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
