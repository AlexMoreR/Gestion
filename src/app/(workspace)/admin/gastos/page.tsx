import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { createPrismaExpensesRepository } from "@/modules/expenses/infrastructure/prisma-expenses-repository";
import { ExpensesWorkspace } from "@/modules/expenses/presentation/expenses-workspace";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminExpensesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "expenses");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const expensesRepository = createPrismaExpensesRepository();
  const balancesRepository = createPrismaBalancesRepository();

  // El id del JWT puede apuntar a un usuario que ya no existe; resolvemos un
  // User real por id o por email antes de sembrar categorias por defecto.
  const sessionUser =
    (await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } })) ??
    (session.user.email
      ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      : null);

  // Crea Nomina / Marketing / Varios la primera vez que se abre el modulo.
  if (sessionUser) {
    await expensesRepository.ensureDefaultCategories(sessionUser.id);
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [currency, metrics, expenses, categories, categoryTotals, accounts] = await Promise.all([
    getSystemCurrency(),
    expensesRepository.getMetrics(),
    expensesRepository.listExpenses(),
    expensesRepository.listCategories(),
    expensesRepository.listCategoryTotals(),
    balancesRepository.listAccounts({ activeOnly: true }),
  ]);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Gastos actualizados"
        errorTitle="Error en gastos"
      />

      <ExpensesWorkspace
        currency={currency}
        metrics={metrics}
        expenses={expenses}
        categories={categories}
        categoryTotals={categoryTotals}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
      />
    </section>
  );
}
