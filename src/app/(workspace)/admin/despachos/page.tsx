import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { DispatchesWorkspace } from "@/components/admin/dispatches-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";

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

  const dispatches = await prisma.dispatch.findMany({
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
        dispatches={dispatches.map((dispatch) => ({
          id: dispatch.id,
          code: dispatch.code,
          orderCode: dispatch.order.code,
          orderId: dispatch.order.id,
          clientName: dispatch.order.client.name || dispatch.order.client.email,
          carrierName: dispatch.carrierName,
          trackingNumber: dispatch.trackingNumber,
          status: dispatch.status,
          createdAt: dispatch.createdAt.toLocaleDateString("es-CO"),
        }))}
      />
    </section>
  );
}
