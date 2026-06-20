import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
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

  const [metrics, stocks, movements, productSupplierRows, suppliers] = await Promise.all([
    repository.getMetrics(),
    repository.listProductStocks(),
    repository.listMovements(),
    prisma.productSupplier.findMany({
      where: { supplier: { isActive: true } },
      orderBy: [{ isPreferred: "desc" }, { supplier: { name: "asc" } }],
      select: {
        productId: true,
        supplierCost: true,
        supplier: { select: { id: true, name: true } },
      },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Proveedores por producto (solo los asociados a cada producto).
  const suppliersByProduct: Record<string, { id: string; name: string; cost: number | null }[]> = {};
  for (const row of productSupplierRows) {
    (suppliersByProduct[row.productId] ??= []).push({
      id: row.supplier.id,
      name: row.supplier.name,
      cost: row.supplierCost === null ? null : Number(row.supplierCost),
    });
  }

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Inventario actualizado"
        errorTitle="Error en inventario"
      />

      <InventoryWorkspace
        metrics={metrics}
        stocks={stocks}
        movements={movements}
        suppliersByProduct={suppliersByProduct}
        suppliers={suppliers}
      />
    </section>
  );
}
