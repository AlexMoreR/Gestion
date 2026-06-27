import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OrderActionsMenu } from "@/components/admin/order-actions-menu";
import { OrderHistoryTabs } from "@/components/admin/order-history-tabs";
import { OrderItemsTable } from "@/components/admin/order-items-table";
import { OrderStepper } from "@/components/admin/order-stepper";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import {
  getFulfillmentModeLabel,
  getOrderDisplayState,
  getOrderStatusLabel,
} from "@/lib/orders";
import { getSystemCurrency } from "@/lib/system-settings";
import { getPublicAssetUrl } from "@/lib/site";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";

type PageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Formatea una fecha como YYYY-MM-DD usando componentes locales (sin desfase de
// zona horaria) para precargar el campo <input type="date">.
function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  const [order, currency, carriers, accounts] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        sale: {
          include: {
            salePayments: { orderBy: { sortOrder: "asc" } },
            shippingCosts: { select: { amount: true } },
          },
        },
        client: true,
        supplier: true,
        createdBy: true,
        assignedTo: true,
        items: {
          include: {
            product: {
              include: {
                suppliers: {
                  include: { supplier: true },
                  orderBy: { isPreferred: "desc" },
                },
              },
            },
            confirmedSupplier: true,
            photos: { orderBy: { createdAt: "asc" } },
            supplierLedgerEntries: {
              where: { type: "PAYMENT" },
              select: { amount: true },
            },
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
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!order) {
    notFound();
  }

  const returnTo = `/admin/ordenes/${order.id}`;
  // Costo total de compra de la orden (usa el costo confirmado por item y, si falta,
  // el del proveedor preferido o el costo base del producto).
  const totalPurchaseCost = order.items.reduce((sum, item) => {
    const preferred = item.product.suppliers[0];
    const unitCost = Number(item.purchaseCost ?? preferred?.supplierCost ?? item.product.baseCost);
    return sum + unitCost * item.quantity;
  }, 0);
  // Costo de envio pagado al proveedor de transporte (registrado en la venta).
  // Debe restarse de la ganancia, igual que en el modulo de balances.
  const totalShippingCost = (order.sale?.shippingCosts ?? []).reduce(
    (sum, cost) => sum + Number(cost.amount),
    0,
  );
  const earnedValue = Number(order.total) - totalPurchaseCost - totalShippingCost;
  // En una compra el item ya viene comprado (se confirma al registrarla, aunque
  // no tenga proveedor); en una venta hay que confirmar proveedor + costo.
  const isPurchase = order.type === "PURCHASE";
  const itemIsConfirmed = (item: (typeof order.items)[number]) =>
    isPurchase
      ? item.confirmedAt !== null
      : Boolean(item.confirmedSupplierId) && item.purchaseCost !== null;
  const allItemsConfirmed = order.items.length > 0 && order.items.every(itemIsConfirmed);
  const allItemsHavePhotos =
    order.items.length > 0 && order.items.every((item) => item.photos.length > 0);
  const allItemsPaymentSet =
    order.items.length > 0 && order.items.every((item) => item.supplierPaymentStatus !== null);
  const canDispatch = allItemsConfirmed && allItemsHavePhotos && allItemsPaymentSet;

  const latestDispatch = order.dispatches[0] ?? null;

  // Despacho por producto: un item esta despachado si pertenece a un despacho
  // activo (no cancelado ni devuelto). La orden pasa a "Despachada" solo cuando
  // todos los productos estan despachados.
  const dispatchByItemId = new Map<string, { code: string; carrierName: string | null }>();
  for (const dispatch of order.dispatches) {
    if (dispatch.status === "CANCELLED" || dispatch.status === "RETURNED") {
      continue;
    }
    for (const dispatchItem of dispatch.items) {
      if (!dispatchByItemId.has(dispatchItem.orderItemId)) {
        dispatchByItemId.set(dispatchItem.orderItemId, {
          code: dispatch.code,
          carrierName: dispatch.carrierName,
        });
      }
    }
  }
  const isItemDespachado = (item: (typeof order.items)[number]) => dispatchByItemId.has(item.id);

  const step1Done = allItemsConfirmed;
  const step2Done = allItemsPaymentSet && allItemsHavePhotos;
  const step3Done = order.items.length > 0 && order.items.every((item) => isItemDespachado(item));
  const step4Done = order.status === "COMPLETED" || latestDispatch?.status === "DELIVERED";
  const displayState = getOrderDisplayState(
    order.status,
    latestDispatch
      ? { deliveryType: latestDispatch.deliveryType, status: latestDispatch.status }
      : null,
  );

  const isItemConfirmed = itemIsConfirmed;
  const isItemRecogido = (item: (typeof order.items)[number]) =>
    item.supplierPaymentStatus !== null && item.photos.length > 0;
  const pendingFabricar = order.items.filter((item) => !isItemConfirmed(item)).length;
  const pendingRecoger = order.items.filter(
    (item) => isItemConfirmed(item) && !isItemRecogido(item),
  ).length;
  const pendingDespachar = order.items.filter(
    (item) => isItemConfirmed(item) && isItemRecogido(item) && !isItemDespachado(item),
  ).length;
  const pluralProductos = (n: number) => `${n} producto${n === 1 ? "" : "s"}`;
  const itemsTitle =
    pendingFabricar > 0
      ? `Pendiente fabricar ${pluralProductos(pendingFabricar)}`
      : pendingRecoger > 0
        ? `Pendiente recoger ${pluralProductos(pendingRecoger)}`
        : pendingDespachar > 0
          ? `Pendiente despachar ${pluralProductos(pendingDespachar)}`
          : "Despachado";

  const orderItemsData = order.items.map((item) => {
    const preferred = item.product.suppliers[0];
    const meta = parseQuoteItemMeta(item.notes);
    const observations = [meta.description, meta.color ? `Color: ${meta.color}` : ""]
      .filter(Boolean)
      .join(" - ");
    return {
      id: item.id,
      orderId: order.id,
      productName: item.product.name,
      productCode: item.product.code,
      productImageUrl: item.product.thumbnailUrl ? getPublicAssetUrl(item.product.thumbnailUrl) : null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      fulfillmentLabel: getFulfillmentModeLabel(item.fulfillmentMode),
      observations,
      isConfirmed: itemIsConfirmed(item),
      isRecogido: isItemRecogido(item),
      isDespachado: isItemDespachado(item),
      dispatchCode: dispatchByItemId.get(item.id)?.code ?? null,
      dispatchCarrierName: dispatchByItemId.get(item.id)?.carrierName ?? null,
      requiresManufacturing: item.fulfillmentMode !== "STOCK",
      hasProductionJob: item.productionJobs.length > 0,
      suppliers: item.product.suppliers.map((entry) => ({
        id: entry.supplierId,
        name: entry.supplier.name,
      })),
      defaultSupplierId: item.confirmedSupplierId ?? preferred?.supplierId ?? "",
      defaultCost: Number(item.purchaseCost ?? preferred?.supplierCost ?? item.product.baseCost),
      confirmedSupplierName: item.confirmedSupplier?.name ?? null,
      purchaseCost: item.purchaseCost === null ? null : Number(item.purchaseCost),
      supplierCostTotal: item.purchaseCost === null ? 0 : Number(item.purchaseCost) * item.quantity,
      supplierPaidTotal: item.supplierLedgerEntries.reduce((sum, entry) => sum + Number(entry.amount), 0),
      paymentStatus:
        item.supplierPaymentStatus === "PAID"
          ? ("PAID" as const)
          : item.supplierPaymentStatus === "PENDING"
            ? ("PENDING" as const)
            : null,
      receiptUrl: item.supplierReceiptUrl,
      photos: item.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        name: photo.name,
      })),
    };
  });

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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{order.code}</h1>
          {order.type === "PURCHASE" ? (
            <p className="text-sm text-muted-foreground">
              Compra{order.supplier ? ` a ${order.supplier.name}` : " a proveedor"}
              {order.createdBy ? ` · ${order.createdBy.name || order.createdBy.email}` : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Venta{" "}
              <Link href="/admin/ventas" className="font-medium text-foreground hover:underline">
                {order.sale?.code}
              </Link>{" "}
              - Cliente {order.client?.name || order.client?.email}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge className={displayState.className} variant="outline">
            {displayState.label}
          </Badge>
          <OrderActionsMenu
            orderId={order.id}
            status={order.status}
            returnTo={returnTo}
            orderDate={toDateInputValue(order.createdAt)}
            items={order.items.map((item) => ({
              id: item.id,
              name: item.product.name,
              code: item.product.code,
              quantity: item.quantity,
              fulfillmentMode: item.fulfillmentMode,
            }))}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
            <p className="text-lg font-semibold text-foreground">{formatMoney(Number(order.total), currency)}</p>
          </CardContent>
        </Card>
        {!isPurchase && (
          <Card className="border-border bg-card/95 py-2">
            <CardContent className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Valor ganado</p>
              <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(earnedValue, currency)}</p>
            </CardContent>
          </Card>
        )}
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Produccion</p>
            <p className="text-lg font-semibold text-foreground">{order.productionJobs.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Despachos</p>
            <p className="text-lg font-semibold text-foreground">{order.dispatches.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <Badge
              variant="outline"
              className={
                pendingFabricar > 0 || pendingRecoger > 0 || pendingDespachar > 0
                  ? "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              }
            >
              {itemsTitle}
            </Badge>
          </div>
          <OrderItemsTable
            orderId={order.id}
            items={orderItemsData}
            currency={currency}
            returnTo={returnTo}
            accounts={accounts}
            carriers={carriers}
            defaultAddress={order.client?.address ?? ""}
          />
        </div>

        <div className="space-y-4">
          <OrderStepper
            step1Done={step1Done}
            step2Done={step2Done}
            step3Done={step3Done}
            step4Done={step4Done}
            dispatch={{
              orderId: order.id,
              returnTo,
              carriers,
              accounts,
              defaultAddress: order.client?.address ?? "",
              canDispatch,
              allItemsConfirmed,
              allItemsPaymentSet,
              allItemsHavePhotos,
            }}
            delivery={{
              dispatchId: latestDispatch?.id ?? null,
              returnTo,
              defaultInstagram: order.client?.instagram ?? "",
              defaultTiktok: order.client?.tiktok ?? "",
            }}
          />

          <Card className="border-border bg-card/95">
            <CardContent>
              <OrderHistoryTabs
                currency={currency}
                history={order.history.map((item) => ({
                  id: item.id,
                  fromLabel: item.fromStatus ? getOrderStatusLabel(item.fromStatus) : "Nuevo",
                  toLabel: getOrderStatusLabel(item.toStatus),
                  date: item.createdAt.toLocaleDateString("es-CO"),
                  by: item.changedBy.name ?? item.changedBy.email,
                  note: item.note,
                }))}
                payments={(order.sale?.salePayments ?? []).map((payment) => ({
                  id: payment.id,
                  amount: Number(payment.amount),
                  method: payment.paymentMethod ?? null,
                  note: payment.note ?? null,
                  paidAt: (payment.paymentDate ?? payment.createdAt).toLocaleDateString("es-CO"),
                  receiptUrl: payment.receiptUrl ?? null,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
