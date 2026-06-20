import { randomUUID } from "node:crypto";
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
          const balance = supplier.ledgerEntries.reduce((acc, entry) => {
            const amount = Number(entry.amount);
            return entry.type === "CHARGE" ? acc + amount : acc - amount;
          }, 0);

          // Ordenes asociadas a este proveedor con su saldo pendiente (cargos - pagos).
          const ordersMap = new Map<
            string,
            { orderId: string; code: string; saleId: string; charged: number; paid: number }
          >();
          for (const entry of supplier.ledgerEntries) {
            if (!entry.order) continue;
            const current = ordersMap.get(entry.order.id) ?? {
              orderId: entry.order.id,
              code: entry.order.code,
              saleId: entry.order.saleId,
              charged: 0,
              paid: 0,
            };
            const amount = Number(entry.amount);
            if (entry.type === "CHARGE") current.charged += amount;
            else current.paid += amount;
            ordersMap.set(entry.order.id, current);
          }
          const orders = Array.from(ordersMap.values())
            .map((order) => ({
              orderId: order.orderId,
              code: order.code,
              saleId: order.saleId,
              pending: order.charged - order.paid,
            }))
            .filter((order) => order.pending > 0.0001)
            .sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));

          return {
            id: supplier.id,
            name: supplier.name,
            displayName: supplier.displayName,
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
