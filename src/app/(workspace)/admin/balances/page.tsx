import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { createPrismaExpensesRepository } from "@/modules/expenses/infrastructure/prisma-expenses-repository";
import { BalancesWorkspace } from "@/modules/balances/presentation/balances-workspace";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Resuelve el mes solicitado (YYYY-MM) o el mes en curso por defecto, y devuelve
// el rango semiabierto [from, to) junto con el valor y la etiqueta para la UI.
function resolveMonth(monthParam: string | undefined) {
  const now = new Date();
  // Mes en curso en hora de Colombia (UTC-5). Sin este ajuste, la noche del
  // ultimo dia del mes ya cae en el mes siguiente segun UTC (ej. 30/06 8pm
  // local = 01/07 en UTC), mostrando el mes equivocado por defecto.
  const bogotaNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  let year = bogotaNow.getUTCFullYear();
  let monthIndex = bogotaNow.getUTCMonth();

  if (typeof monthParam === "string" && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [parsedYear, parsedMonth] = monthParam.split("-").map(Number);
    if (parsedMonth >= 1 && parsedMonth <= 12) {
      year = parsedYear;
      monthIndex = parsedMonth - 1;
    }
  }

  // Limites en UTC: las fechas de gasto se guardan como medianoche UTC, asi que
  // un gasto del dia 1 cae dentro de su mes y no del anterior.
  const from = new Date(Date.UTC(year, monthIndex, 1));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1));
  const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const label = from.toLocaleDateString("es", { month: "long", year: "numeric", timeZone: "UTC" });

  return { period: { from, to }, value, label };
}

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
  const expensesRepository = createPrismaExpensesRepository();
  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";
  const { period, value: monthValue, label: monthLabel } = resolveMonth(
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
    expenseCategoryTotals,
    activeAccounts,
    employees,
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
    expensesRepository.listCategoryTotals(period),
    repository.listAccounts({ activeOnly: true }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "EMPLEADO"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
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
        monthValue={monthValue}
        monthLabel={monthLabel}
        sales={sales.map((sale) => ({
          id: sale.id,
          code: sale.code,
          total: Number(sale.total),
          clientName: sale.client.name,
        }))}
        suppliers={suppliers}
        expensesData={{
          currency,
          metrics: expenseMetrics,
          expenses,
          categories: expenseCategories,
          categoryTotals: expenseCategoryTotals,
          accounts: activeAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            isCash: account.type === "CASH",
          })),
          employees: employees.map((employee) => ({
            id: employee.id,
            name: employee.name ?? employee.email,
          })),
        }}
      />
    </section>
  );
}
