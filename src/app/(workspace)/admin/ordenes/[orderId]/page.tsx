import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { adminCancelOrderAction, adminUpdateOrderStatusAction } from "@/app/actions/orders-actions";
import { adminCreateDispatchAction } from "@/app/actions/dispatch-actions";
import { adminCreateProductionJobAction } from "@/app/actions/production-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { Textarea } from "@/components/ui/textarea";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import {
  getDispatchStatusBadgeClassName,
  getDispatchStatusLabel,
  getFulfillmentModeLabel,
  getOrderStatusBadgeClassName,
  getOrderStatusLabel,
  getProductionJobStatusBadgeClassName,
  getProductionJobStatusLabel,
} from "@/lib/orders";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function OrderStatusAction({
  orderId,
  status,
  label,
  variant = "outline",
}: {
  orderId: string;
  status: "DRAFT" | "RELEASED" | "IN_PRODUCTION" | "READY_FOR_DISPATCH" | "DISPATCHED" | "COMPLETED" | "CANCELLED";
  label: string;
  variant?: "outline" | "default" | "destructive";
}) {
  return (
    <form action={adminUpdateOrderStatusAction}>
      <input type="hidden" name="returnTo" value={`/admin/ordenes/${orderId}`} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant} className="h-7">
        {label}
      </Button>
    </form>
  );
}

export default async function AdminOrderDetailPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const [{ orderId }, query] = await Promise.all([params, searchParams]);
  const okMessage = typeof query.ok === "string" ? query.ok : "";
  const errorMessage = typeof query.error === "string" ? query.error : "";

  const [order, currency] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        sale: true,
        client: true,
        createdBy: true,
        assignedTo: true,
        items: {
          include: {
            product: true,
            productionJobs: {
              include: {
                assignedTo: true,
                createdBy: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        productionJobs: {
          include: {
            assignedTo: true,
            createdBy: true,
            orderItem: {
              include: {
                product: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        dispatches: {
          include: {
            createdBy: true,
            items: {
              include: {
                orderItem: {
                  include: {
                    product: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        history: {
          include: {
            changedBy: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!order) {
    notFound();
  }

  const activeDispatch = order.dispatches.find((dispatch) =>
    ["PENDING", "PACKING", "SHIPPED"].includes(dispatch.status),
  );

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Orden actualizada"
        errorTitle="No se pudo actualizar"
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{order.code}</h1>
            <Badge className={getOrderStatusBadgeClassName(order.status)} variant="outline">
              {getOrderStatusLabel(order.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Venta{" "}
            <Link href="/admin/ventas" className="font-medium text-foreground hover:underline">
              {order.sale.code}
            </Link>{" "}
            - Cliente {order.client.name || order.client.email}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.status === "DRAFT" ? (
            <OrderStatusAction orderId={order.id} status="RELEASED" label="Liberar" />
          ) : null}
          {order.status === "RELEASED" ? (
            <OrderStatusAction orderId={order.id} status="IN_PRODUCTION" label="Iniciar produccion" />
          ) : null}
          {order.status === "IN_PRODUCTION" ? (
            <OrderStatusAction orderId={order.id} status="READY_FOR_DISPATCH" label="Lista para despacho" />
          ) : null}
          {order.status === "READY_FOR_DISPATCH" ? (
            <OrderStatusAction orderId={order.id} status="DISPATCHED" label="Marcar despachada" />
          ) : null}
          {order.status === "DISPATCHED" ? (
            <OrderStatusAction orderId={order.id} status="COMPLETED" label="Cerrar orden" />
          ) : null}
          {order.status !== "COMPLETED" && order.status !== "CANCELLED" ? (
            <form action={adminCancelOrderAction}>
              <input type="hidden" name="returnTo" value={`/admin/ordenes/${order.id}`} />
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="note" value="Cancelada desde detalle" />
              <Button type="submit" variant="destructive" size="sm" className="h-7">
                Cancelar
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold text-foreground">{formatMoney(Number(order.total), currency)}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Items</p>
            <p className="text-2xl font-semibold text-foreground">{order.items.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Produccion</p>
            <p className="text-2xl font-semibold text-foreground">{order.productionJobs.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2 pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Despachos</p>
            <p className="text-2xl font-semibold text-foreground">{order.dispatches.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card className="border-border bg-card/95">
          <CardHeader>
            <CardTitle>Orden</CardTitle>
            <CardDescription>Detalle comercial y operativo de la orden.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cliente</p>
                <p className="text-sm text-foreground">{order.client.name || order.client.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Responsable</p>
                <p className="text-sm text-foreground">{order.assignedTo?.name ?? order.assignedTo?.email ?? "Sin asignar"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Creada por</p>
                <p className="text-sm text-foreground">{order.createdBy.name ?? order.createdBy.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Nota comercial</p>
                <p className="text-sm text-foreground">{order.notes || "Sin notas"}</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Items</p>
              <div className="space-y-2">
                {order.items.map((item) => {
                  const requiresManufacturing = item.fulfillmentMode !== "STOCK";
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} x {formatMoney(Number(item.unitPrice), currency)} - {getFulfillmentModeLabel(item.fulfillmentMode)}
                          </p>
                          <p className="text-xs text-muted-foreground">{item.notes || "Sin observaciones"}</p>
                        </div>
                        {requiresManufacturing ? (
                          <form action={adminCreateProductionJobAction} className="shrink-0">
                            <input type="hidden" name="returnTo" value={`/admin/ordenes/${order.id}`} />
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="orderItemId" value={item.id} />
                            <input type="hidden" name="quantity" value={item.quantity} />
                            <input type="hidden" name="notes" value={item.notes ?? ""} />
                            <Button type="submit" size="sm" variant="outline" className="h-7">
                              Crear trabajo
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border bg-card/95">
            <CardHeader>
              <CardTitle>Despacho</CardTitle>
              <CardDescription>Crea la salida operacional de la orden.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeDispatch ? (
                <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                  Ya existe un despacho activo para esta orden:{" "}
                  <span className="font-medium text-foreground">{activeDispatch.code}</span>
                </div>
              ) : (
                <form action={adminCreateDispatchAction} className="space-y-3">
                  <input type="hidden" name="returnTo" value={`/admin/ordenes/${order.id}`} />
                  <input type="hidden" name="orderId" value={order.id} />
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Transportadora</label>
                    <Input name="carrierName" placeholder="Transportadora" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Guia</label>
                    <Input name="trackingNumber" placeholder="Numero de guia" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Direccion</label>
                    <Input name="shippingAddress" defaultValue={order.client.address ?? ""} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Notas</label>
                    <Textarea name="notes" placeholder="Observaciones internas" />
                  </div>
                  <Button type="submit" className="w-full">
                    Crear despacho
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/95">
            <CardHeader>
              <CardTitle>Historial</CardTitle>
              <CardDescription>Registro completo de cambios de estado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
              ) : (
                order.history.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {item.fromStatus ? getOrderStatusLabel(item.fromStatus) : "Nuevo"}{" "}
                        <span className="text-muted-foreground">-&gt;</span> {getOrderStatusLabel(item.toStatus)}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.createdAt.toLocaleDateString("es-CO")}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.changedBy.name ?? item.changedBy.email}
                      {item.note ? ` - ${item.note}` : ""}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/95">
            <CardHeader>
              <CardTitle>Produccion</CardTitle>
              <CardDescription>Avance de los trabajos vinculados a la orden.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.productionJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aun no hay trabajos de produccion.</p>
              ) : (
                order.productionJobs.map((job) => (
                  <div key={job.id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{job.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.orderItem?.product.name ?? "Orden completa"} - {job.quantity}
                        </p>
                      </div>
                      <Badge className={getProductionJobStatusBadgeClassName(job.status)} variant="outline">
                        {getProductionJobStatusLabel(job.status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {job.assignedTo?.name ?? job.assignedTo?.email ?? "Sin asignar"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card/95">
            <CardHeader>
              <CardTitle>Despachos</CardTitle>
              <CardDescription>Seguimiento de salida y entrega.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.dispatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aun no hay despachos.</p>
              ) : (
                order.dispatches.map((dispatch) => (
                  <div key={dispatch.id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{dispatch.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {dispatch.carrierName ?? "Sin transportadora"} - {dispatch.trackingNumber ?? "Sin guia"}
                        </p>
                      </div>
                      <Badge className={getDispatchStatusBadgeClassName(dispatch.status)} variant="outline">
                        {getDispatchStatusLabel(dispatch.status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Creado por {dispatch.createdBy.name ?? dispatch.createdBy.email}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
