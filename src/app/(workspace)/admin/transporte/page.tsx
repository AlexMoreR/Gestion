import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { TransporteWorkspace } from "@/modules/transporte/presentation/transporte-workspace";
import {
  ensureTransportSeed,
  getTransportMetrics,
  listDepartmentSummaries,
  listPendingReview,
} from "@/modules/transporte/infrastructure/transporte-repository";

export default async function AdminTransportePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "transporte");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  // Carga los datos DANE la primera vez que se abre el modulo.
  await ensureTransportSeed();

  const [metrics, departments, pending] = await Promise.all([
    getTransportMetrics(),
    listDepartmentSummaries(),
    listPendingReview(),
  ]);

  return (
    <section className="w-full space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">
          Define el tipo de envio de cada ciudad y corregimiento. Los clientes ven el envio gratis en{" "}
          <span className="font-medium text-foreground">magilus.com/cobertura</span> y las asesoras consultan el tipo
          desde el CRM.
        </p>
      </div>

      <TransporteWorkspace metrics={metrics} departments={departments} pending={pending} />
    </section>
  );
}
