import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { TransporteWorkspace } from "@/modules/transporte/presentation/transporte-workspace";
import {
  ensureTransportSeed,
  getTransportMetrics,
  listDepartmentSummaries,
} from "@/modules/transporte/infrastructure/transporte-repository";

export default async function AdminTransportePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "transporte");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  // Carga los datos DANE la primera vez que se abre el modulo.
  await ensureTransportSeed();

  const [metrics, departments] = await Promise.all([getTransportMetrics(), listDepartmentSummaries()]);

  return (
    <section className="w-full space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Transporte</h1>
        <p className="text-sm text-muted-foreground">
          Marca las ciudades y corregimientos donde ofreces envio gratis. Los clientes lo consultan en{" "}
          <span className="font-medium text-foreground">magilus.com/cobertura</span>.
        </p>
      </div>

      <TransporteWorkspace metrics={metrics} departments={departments} />
    </section>
  );
}
