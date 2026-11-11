import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SuppliersWorkspace } from "@/components/admin/suppliers-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";
import { summarizeSupplierDebt } from "@/lib/supplier-debt";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProveedoresPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "suppliers");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [suppliers, currency] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true } },
        // Solo para el saldo: el detalle de la cuenta se ve en /admin/proveedores/[id]/cuenta.
        ledgerEntries: {
          orderBy: { createdAt: "desc" },
          select: { type: true, amount: true, orderId: true },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  // Asegura un token de link publico para cada proveedor (se genera una sola vez).
  const tokenUpdates: Promise<unknown>[] = [];
  for (const supplier of suppliers) {
    if (!supplier.shareToken) {
      supplier.shareToken = randomUUID();
      tokenUpdates.push(
        prisma.supplier.update({ where: { id: supplier.id }, data: { shareToken: supplier.shareToken } }),
      );
    }
  }
  if (tokenUpdates.length > 0) {
    await Promise.all(tokenUpdates);
  }

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Proveedor actualizado"
        errorTitle="Error en proveedores"
      />

      <SuppliersWorkspace
        currency={currency}
        suppliers={suppliers.map((supplier) => {
          const balance = summarizeSupplierDebt(
            supplier.ledgerEntries.map((entry) => ({ ...entry, amount: Number(entry.amount) })),
          ).balance;

          return {
            id: supplier.id,
            name: supplier.name,
            displayName: supplier.displayName,
            dispatchWarning: supplier.dispatchWarning,
            email: supplier.email,
            phone: supplier.phone,
            type: supplier.type,
            shareToken: supplier.shareToken,
            productsCount: supplier._count.products,
            balance,
          };
        })}
      />
    </section>
  );
}
