import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { OrdersWorkspace } from "@/components/admin/orders-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminOrdenesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [orders, currency] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sale: true,
        client: true,
        assignedTo: true,
      },
      take: 200,
    }),
    getSystemCurrency(),
  ]);

  const stats = orders.reduce(
    (acc, order) => {
      acc.ordersCount += 1;
      if (order.status !== "COMPLETED" && order.status !== "CANCELLED") {
        acc.activeCount += 1;
      }
      if (order.status === "IN_PRODUCTION") {
        acc.productionCount += 1;
      }
      if (order.status === "READY_FOR_DISPATCH") {
        acc.readyToDispatchCount += 1;
      }
      if (order.status === "COMPLETED") {
        acc.completedCount += 1;
      }
      return acc;
    },
    {
      ordersCount: 0,
      activeCount: 0,
      productionCount: 0,
      readyToDispatchCount: 0,
      completedCount: 0,
    },
  );

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Ordenes actualizadas"
        errorTitle="Error en ordenes"
      />

      <OrdersWorkspace
        currency={currency}
        stats={stats}
        orders={orders.map((order) => ({
          id: order.id,
          code: order.code,
          saleCode: order.sale.code,
          clientName: order.client.name || order.client.email,
          assignedToName: order.assignedTo?.name ?? order.assignedTo?.email ?? null,
          total: Number(order.total),
          status: order.status,
          createdAt: order.createdAt.toLocaleDateString("es-CO"),
        }))}
      />
    </section>
  );
}
