import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { DispatchesWorkspace } from "@/components/admin/dispatches-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminDespachosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "dispatches");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [dispatches, currency, paidSales] = await Promise.all([
    prisma.dispatch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          include: {
            client: true,
          },
        },
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
      take: 200,
    }),
    getSystemCurrency(),
    // Ventas no canceladas con sus pagos y el estado de despacho de su orden,
    // para detectar las que el cliente ya pago al 100% pero aun no han salido.
    prisma.sale.findMany({
      where: { status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        total: true,
        client: { select: { name: true, email: true } },
        salePayments: { select: { amount: true, paymentDate: true, createdAt: true } },
        order: {
          select: {
            id: true,
            code: true,
            status: true,
            dispatches: { select: { status: true } },
          },
        },
      },
      take: 500,
    }),
  ]);

  // Pagada al 100% y sin un despacho enviado/entregado = pendiente de despachar.
  const paidNotDispatched = paidSales
    .filter((sale) => {
      const total = Number(sale.total);
      if (total <= 0) {
        return false;
      }
      const paid = sale.salePayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      if (paid < total) {
        return false;
      }
      const dispatched = sale.order?.dispatches.some(
        (dispatch) => dispatch.status === "SHIPPED" || dispatch.status === "DELIVERED",
      );
      return !dispatched;
    })
    .map((sale) => {
      const lastPaidAt = sale.salePayments.reduce<Date | null>((latest, payment) => {
        const date = payment.paymentDate ?? payment.createdAt;
        return !latest || date > latest ? date : latest;
      }, null);
      return {
        saleId: sale.id,
        saleCode: sale.code,
        clientName: sale.client.name || sale.client.email,
        total: Number(sale.total),
        paidAt: lastPaidAt ? lastPaidAt.toLocaleDateString("es-CO") : null,
        orderId: sale.order?.id ?? null,
        orderCode: sale.order?.code ?? null,
        orderStatus: sale.order?.status ?? null,
      };
    });

  const stats = dispatches.reduce(
    (acc, dispatch) => {
      acc.dispatchesCount += 1;
      if (dispatch.status === "PENDING" || dispatch.status === "PACKING") {
        acc.pendingCount += 1;
      }
      if (dispatch.status === "SHIPPED") {
        acc.shippedCount += 1;
      }
      if (dispatch.status === "DELIVERED") {
        acc.deliveredCount += 1;
      }
      return acc;
    },
    {
      dispatchesCount: 0,
      pendingCount: 0,
      shippedCount: 0,
      deliveredCount: 0,
    },
  );

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Despachos actualizados"
        errorTitle="Error en despachos"
      />

      <DispatchesWorkspace
        stats={stats}
        currency={currency}
        paidNotDispatched={paidNotDispatched}
        dispatches={dispatches.map((dispatch) => ({
          id: dispatch.id,
          code: dispatch.code,
          orderCode: dispatch.order.code,
          orderId: dispatch.order.id,
          clientName: dispatch.order.client?.name || dispatch.order.client?.email || dispatch.order.code,
          carrierName: dispatch.carrierName,
          trackingNumber: dispatch.trackingNumber,
          status: dispatch.status,
          createdAt: dispatch.createdAt.toLocaleDateString("es-CO"),
          deliveryType: dispatch.deliveryType,
          shippingCost: dispatch.shippingCost === null ? null : Number(dispatch.shippingCost),
          shippingAddress: dispatch.shippingAddress,
          notes: dispatch.notes,
          packedAt: dispatch.packedAt?.toLocaleDateString("es-CO") ?? null,
          shippedAt: dispatch.shippedAt?.toLocaleDateString("es-CO") ?? null,
          deliveredAt: dispatch.deliveredAt?.toLocaleDateString("es-CO") ?? null,
          shippingReceiptUrl: dispatch.shippingReceiptUrl ? getPublicAssetUrl(dispatch.shippingReceiptUrl) : null,
          items: dispatch.items.map((item) => ({
            id: item.id,
            name: item.orderItem.product.name,
            code: item.orderItem.product.code,
            quantity: item.quantity,
            shippingCost: Number(item.shippingCost),
          })),
        }))}
      />
    </section>
  );
}
