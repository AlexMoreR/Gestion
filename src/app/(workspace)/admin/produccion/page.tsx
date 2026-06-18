import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { ProductionWorkspace } from "@/components/admin/production-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProduccionPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "production");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const jobs = await prisma.productionJob.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      order: {
        include: {
          client: true,
        },
      },
      orderItem: {
        include: {
          product: true,
        },
      },
      assignedTo: true,
    },
    take: 200,
  });

  const stats = jobs.reduce(
    (acc, job) => {
      acc.jobsCount += 1;
      if (job.status === "PENDING") {
        acc.pendingCount += 1;
      }
      if (job.status === "IN_PROGRESS" || job.status === "PAUSED") {
        acc.activeCount += 1;
      }
      if (job.status === "DONE") {
        acc.doneCount += 1;
      }
      return acc;
    },
    {
      jobsCount: 0,
      pendingCount: 0,
      activeCount: 0,
      doneCount: 0,
    },
  );

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Produccion actualizada"
        errorTitle="Error en produccion"
      />

      <ProductionWorkspace
        stats={stats}
        jobs={jobs.map((job) => ({
          id: job.id,
          code: job.code,
          orderCode: job.order.code,
          orderId: job.order.id,
          productName: job.orderItem?.product.name ?? "Orden completa",
          quantity: job.quantity,
          status: job.status,
          dueDate: job.dueDate ? job.dueDate.toLocaleDateString("es-CO") : null,
          assignedToName: job.assignedTo?.name ?? job.assignedTo?.email ?? null,
          notes: job.notes,
        }))}
      />
    </section>
  );
}
