import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { BalancesWorkspace } from "@/modules/balances/presentation/balances-workspace";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminBalancesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "balances");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const repository = createPrismaBalancesRepository();
  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [currency, metrics, supplierBalances, paymentHistory, shippingCosts, profitReport, accounts, sales, suppliers] = await Promise.all([
    getSystemCurrency(),
    repository.getDashboardMetrics(),
    repository.listSupplierBalances(),
    repository.listSupplierPayments({ page: 1, pageSize: 500, sortBy: "date", sortDirection: "desc" }),
    repository.listShippingCosts({ page: 1, pageSize: 500, sortBy: "date", sortDirection: "desc" }),
    repository.listProfitReport({ page: 1, pageSize: 500, sortBy: "date", sortDirection: "desc" }),
    repository.listAccountBalances(),
    prisma.sale.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        code: true,
        total: true,
        client: { select: { name: true } },
      },
    }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Balances actualizados"
        errorTitle="Error en balances"
      />

      <BalancesWorkspace
        currency={currency}
        metrics={metrics}
        supplierBalances={supplierBalances}
        paymentHistory={paymentHistory.items}
        shippingCosts={shippingCosts.items}
        profitReport={profitReport.items}
        accounts={accounts}
        sales={sales.map((sale) => ({
          id: sale.id,
          code: sale.code,
          total: Number(sale.total),
          clientName: sale.client.name,
        }))}
        suppliers={suppliers}
      />
    </section>
  );
}
