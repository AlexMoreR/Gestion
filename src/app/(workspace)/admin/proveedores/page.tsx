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
            order: { select: { id: true, code: true, saleId: true } },
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
        accounts={accounts}
        suppliers={suppliers.map((supplier) => {
          const debt = summarizeSupplierDebt(
            supplier.ledgerEntries.map((entry) => ({ ...entry, amount: Number(entry.amount) })),
          );
          const balance = debt.balance;

          // Ordenes asociadas a este proveedor con su saldo pendiente (cargos - pagos).
          const orderById = new Map(
            supplier.ledgerEntries.flatMap((entry) => (entry.order ? [[entry.order.id, entry.order] as const] : [])),
          );
          const orders = debt.orders
            .flatMap((order) => {
              const info = orderById.get(order.orderId);
              return info ? [{ orderId: info.id, code: info.code, saleId: info.saleId, pending: order.pending }] : [];
            })
            .filter((order) => order.pending > 0.0001)
            .sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));

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
            orders,
            ledger: supplier.ledgerEntries.map((entry) => ({
              id: entry.id,
              type: entry.type,
              amount: Number(entry.amount),
              note: entry.note,
              createdAt: (entry.paymentDate ?? entry.createdAt).toISOString(),
              createdByName: entry.createdBy.name ?? entry.createdBy.email,
              accountName: entry.account?.name ?? null,
              orderCode: entry.order?.code ?? null,
              receiptUrl: entry.receiptUrl ?? null,
            })),
          };
        })}
      />
    </section>
  );
}
