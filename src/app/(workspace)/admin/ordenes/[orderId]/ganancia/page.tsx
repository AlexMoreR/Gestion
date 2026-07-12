import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getFulfillmentModeLabel } from "@/lib/orders";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ orderId: string }>;
};

export default async function OrderEarnedValuePage({ params }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const { orderId } = await params;

  const [order, currency] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        sale: {
          include: {
            shippingCosts: { select: { shippingProvider: true, amount: true } },
          },
        },
        client: true,
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
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!order) {
    notFound();
  }

  // Las compras no generan "valor ganado": esta pagina solo aplica a ventas.
  if (order.type === "PURCHASE") {
    redirect(`/admin/ordenes/${order.id}`);
  }

  // Desglose por producto: precio de venta vs costo de compra. El costo unitario
  // usa el costo confirmado por item y, si falta, el del proveedor preferido o el
  // costo base del producto (misma prioridad que en la vista de la orden).
  const itemBreakdown = order.items.map((item) => {
    const preferred = item.product.suppliers[0];
    const unitCost = Number(item.purchaseCost ?? preferred?.supplierCost ?? item.product.baseCost);
    const unitPrice = Number(item.unitPrice);
    const saleTotal = unitPrice * item.quantity;
    const costTotal = unitCost * item.quantity;
    const costSource =
      item.purchaseCost !== null
        ? item.confirmedSupplier?.name
          ? `Costo confirmado (${item.confirmedSupplier.name})`
          : "Costo confirmado"
        : preferred?.supplierCost != null
          ? `Proveedor preferido (${preferred.supplier.name})`
          : "Costo base del producto";
    return {
      id: item.id,
      productName: item.product.name,
      productCode: item.product.code,
      quantity: item.quantity,
      fulfillmentLabel: getFulfillmentModeLabel(item.fulfillmentMode),
      unitPrice,
      unitCost,
      saleTotal,
      costTotal,
      margin: saleTotal - costTotal,
      costSource,
    };
  });

  const itemsSaleTotal = itemBreakdown.reduce((sum, item) => sum + item.saleTotal, 0);
  const totalPurchaseCost = itemBreakdown.reduce((sum, item) => sum + item.costTotal, 0);
  const shippingCosts = order.sale?.shippingCosts ?? [];
  const totalShippingCost = shippingCosts.reduce((sum, cost) => sum + Number(cost.amount), 0);
  const orderTotal = Number(order.total);
  const earnedValue = orderTotal - totalPurchaseCost - totalShippingCost;
  // Diferencia entre el total de la orden y la suma de los items (descuentos,
  // ajustes o fletes cobrados al cliente que no estan a nivel de item).
  const orderAdjustment = orderTotal - itemsSaleTotal;
  const marginPercent = orderTotal > 0 ? (earnedValue / orderTotal) * 100 : 0;

  return (
    <section className="w-full space-y-5">
      <div className="space-y-2">
        <Link
          href={`/admin/ordenes/${order.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a la orden
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Valor ganado · {order.code}
            </h1>
            <p className="text-sm text-muted-foreground">
              Venta {order.sale?.code} - Cliente {order.client?.name || order.client?.email}
            </p>
          </div>
        </div>
      </div>

      {/* Resumen: como se compone el valor ganado */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total de la venta</p>
            <p className="text-lg font-semibold text-foreground">{formatMoney(orderTotal, currency)}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Costo de compra</p>
            <p className="text-lg font-semibold text-rose-600 dark:text-rose-400">
              − {formatMoney(totalPurchaseCost, currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Costo de envío</p>
            <p className="text-lg font-semibold text-rose-600 dark:text-rose-400">
              − {formatMoney(totalShippingCost, currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Valor ganado</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatMoney(earnedValue, currency)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Margen {marginPercent.toFixed(1)}% sobre la venta
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Desglose por producto */}
      <Card className="border-border bg-card/95">
        <CardContent className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Detalle por producto</h2>
            <p className="text-xs text-muted-foreground">
              Ganancia de cada producto = precio de venta − costo de compra.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio venta</TableHead>
                <TableHead className="text-right">Costo compra</TableHead>
                <TableHead className="text-right">Total venta</TableHead>
                <TableHead className="text-right">Total costo</TableHead>
                <TableHead className="text-right">Ganancia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemBreakdown.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground">{item.productName}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{item.productCode}</span>
                        <Badge variant="outline" className="font-normal">
                          {item.fulfillmentLabel}
                        </Badge>
                      </span>
                      <span className="text-[11px] text-muted-foreground">{item.costSource}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(item.unitPrice, currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatMoney(item.unitCost, currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(item.saleTotal, currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600 dark:text-rose-400">
                    − {formatMoney(item.costTotal, currency)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatMoney(item.margin, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Como se calcula el valor ganado */}
      <Card className="border-border bg-card/95">
        <CardContent className="space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Cálculo del valor ganado</h2>
            <p className="text-xs text-muted-foreground">
              Del total de la venta se restan el costo de comprar los productos y el flete pagado al
              transportador.
            </p>
          </div>
          <div className="divide-y divide-border rounded-lg border border-border">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm text-muted-foreground">Suma de productos (venta)</span>
              <span className="text-sm font-medium tabular-nums text-foreground">
                {formatMoney(itemsSaleTotal, currency)}
              </span>
            </div>
            {orderAdjustment !== 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-muted-foreground">
                  {orderAdjustment > 0 ? "Ajuste / cargo adicional" : "Descuento aplicado"}
                </span>
                <span
                  className={
                    orderAdjustment > 0
                      ? "text-sm font-medium tabular-nums text-foreground"
                      : "text-sm font-medium tabular-nums text-rose-600 dark:text-rose-400"
                  }
                >
                  {orderAdjustment > 0 ? "+ " : "− "}
                  {formatMoney(Math.abs(orderAdjustment), currency)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">Total de la venta</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatMoney(orderTotal, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm text-muted-foreground">Costo de compra de los productos</span>
              <span className="text-sm font-medium tabular-nums text-rose-600 dark:text-rose-400">
                − {formatMoney(totalPurchaseCost, currency)}
              </span>
            </div>
            <div className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Costo de envío (flete)</span>
                <span className="text-sm font-medium tabular-nums text-rose-600 dark:text-rose-400">
                  − {formatMoney(totalShippingCost, currency)}
                </span>
              </div>
              {shippingCosts.length > 0 && (
                <ul className="mt-1.5 space-y-1 pl-3">
                  {shippingCosts.map((cost, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
                    >
                      <span>{cost.shippingProvider || "Flete"}</span>
                      <span className="tabular-nums">{formatMoney(Number(cost.amount), currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 bg-emerald-500/5 px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Valor ganado</span>
              <span className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatMoney(earnedValue, currency)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
