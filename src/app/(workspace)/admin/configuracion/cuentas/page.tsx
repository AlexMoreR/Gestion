import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConfigTabs } from "@/components/admin/config-tabs";
import { AccountsConfigWorkspace } from "@/components/admin/accounts-config-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemCurrency } from "@/lib/system-settings";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminConfiguracionCuentasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "config_business");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const repository = createPrismaBalancesRepository();
  const [currency, accounts] = await Promise.all([
    getSystemCurrency(),
    repository.listAccountBalances(),
  ]);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Cuentas actualizadas"
        errorTitle="Error en cuentas"
      />

      <ConfigTabs />

      <Card className="space-y-4">
        <CardContent>
          <AccountsConfigWorkspace currency={currency} accounts={accounts} />
        </CardContent>
      </Card>
    </section>
  );
}
