import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { createPrismaInventoryRepository } from "@/modules/inventory/infrastructure/prisma-inventory-repository";
import { InventoryWorkspace } from "@/modules/inventory/presentation/inventory-workspace";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminInventoryPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "inventory");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const repository = createPrismaInventoryRepository();
  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [metrics, stocks, movements] = await Promise.all([
    repository.getMetrics(),
    repository.listProductStocks(),
    repository.listMovements(),
  ]);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Inventario actualizado"
        errorTitle="Error en inventario"
      />

      <InventoryWorkspace metrics={metrics} stocks={stocks} movements={movements} />
    </section>
  );
}
