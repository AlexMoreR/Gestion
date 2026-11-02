import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { resolveMonthPeriod } from "@/lib/month-period";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { createPrismaExpensesRepository } from "@/modules/expenses/infrastructure/prisma-expenses-repository";
import { BalancesWorkspace } from "@/modules/balances/presentation/balances-workspace";
import { CashPositionStrip } from "@/modules/balances/presentation/components/cash-position-strip";
import { getMoneyWithoutAccount } from "@/modules/balances/infrastructure/prisma-money-without-account";
import { getOwnerContributionsUseCase } from "@/modules/balances/application/use-cases";
import { getCashPositionUseCase } from "@/modules/nomina/application/use-cases";
import { retiredUserIds } from "@/modules/equipo/application/use-cases";
import { todayInBogota } from "@/modules/equipo/domain/team-member";
import { loadTeamMembers } from "@/modules/equipo/infrastructure/prisma-team-repository";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminBalancesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "balances");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const repository = createPrismaBalancesRepository();
  const expensesRepository = createPrismaExpensesRepository();
  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";
  const { period, value: monthValue, label: monthLabel } = resolveMonthPeriod(
    typeof params.month === "string" ? params.month : undefined,
  );
  // El id del JWT puede apuntar a un usuario que ya no existe; resolvemos un
  // User real antes de sembrar las categorias de gasto por defecto.
  const sessionUser =
    (await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } })) ??
    (session.user.email
      ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      : null);
  if (sessionUser) {
    await expensesRepository.ensureDefaultCategories(sessionUser.id);
  }

  const [
    currency,
    metrics,
    supplierBalances,
    paymentHistory,
    shippingCosts,
    profitReport,
    accounts,
    sales,
    suppliers,
    expenseMetrics,
    expenses,
    expenseCategories,
    activeAccounts,
    employees,
    cashPosition,
    team,
    ownerContributions,
  ] = await Promise.all([
    getSystemCurrency(),
    repository.getDashboardMetrics(period),
    repository.listSupplierBalances(),
    repository.listSupplierPayments({ page: 1, pageSize: 500, sortBy: "date", sortDirection: "desc" }),
    repository.listShippingCosts({ page: 1, pageSize: 500, sortBy: "date", sortDirection: "desc" }),
    repository.listProfitReport({ page: 1, pageSize: 500, sortBy: "date", sortDirection: "desc", period }),
    repository.listAccountBalances(period),
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
    expensesRepository.getMetrics(period),
    expensesRepository.listExpenses(period),
    expensesRepository.listCategories(),
    repository.listAccounts({ activeOnly: true }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "EMPLEADO"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    getCashPositionUseCase(repository, getMoneyWithoutAccount),
    loadTeamMembers(),
    getOwnerContributionsUseCase(repository),
  ]);
  const retired = retiredUserIds(team, todayInBogota());

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Balances actualizados"
        errorTitle="Error en balances"
      />

      <CashPositionStrip position={cashPosition} currency={currency} />

      <BalancesWorkspace
        currency={currency}
        metrics={metrics}
        supplierBalances={supplierBalances}
        paymentHistory={paymentHistory.items}
        shippingCosts={shippingCosts.items}
        profitReport={profitReport.items}
        accounts={accounts}
        monthValue={monthValue}
        monthLabel={monthLabel}
        sales={sales.map((sale) => ({
          id: sale.id,
          code: sale.code,
          total: Number(sale.total),
          clientName: sale.client.name,
        }))}
        suppliers={suppliers}
        ownerContributions={ownerContributions}
        expensesData={{
          currency,
          metrics: expenseMetrics,
          expenses,
          categories: expenseCategories,
          accounts: activeAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            isCash: account.type === "CASH",
          })),
          employees: employees.map((employee) => ({
            id: employee.id,
            name: employee.name ?? employee.email,
            retired: retired.has(employee.id),
          })),
        }}
      />
    </section>
  );
}
