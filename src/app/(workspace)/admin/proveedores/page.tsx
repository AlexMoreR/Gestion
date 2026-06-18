import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SuppliersWorkspace } from "@/components/admin/suppliers-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProveedoresPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "suppliers");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [suppliers, currency, accounts] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true } },
        ledgerEntries: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: { select: { name: true, email: true } },
            account: { select: { name: true } },
          },
        },
      },
    }),
    getSystemCurrency(),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

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
        accounts={accounts}
        suppliers={suppliers.map((supplier) => {
          const balance = supplier.ledgerEntries.reduce((acc, entry) => {
            const amount = Number(entry.amount);
            return entry.type === "CHARGE" ? acc + amount : acc - amount;
          }, 0);

          return {
            id: supplier.id,
            name: supplier.name,
            email: supplier.email,
            phone: supplier.phone,
            type: supplier.type,
            productsCount: supplier._count.products,
            balance,
            ledger: supplier.ledgerEntries.map((entry) => ({
              id: entry.id,
              type: entry.type,
              amount: Number(entry.amount),
              note: entry.note,
              createdAt: (entry.paymentDate ?? entry.createdAt).toISOString(),
              createdByName: entry.createdBy.name ?? entry.createdBy.email,
              accountName: entry.account?.name ?? null,
            })),
          };
        })}
      />
    </section>
  );
}
