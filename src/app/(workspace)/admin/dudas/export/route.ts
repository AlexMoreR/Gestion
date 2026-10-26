import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { csvDeRespuestas, filasDeRespuestas } from "@/modules/dudas/application/reportes";
import { createPrismaDudasRepository } from "@/modules/dudas/infrastructure/prisma-dudas-repository";

// CSV con todas las respuestas de "Dudas del catalogo" (historial; columna "vigente"). Solo admin.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return new Response("Unauthorized", { status: 401 });
  }
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "dudas");
  if (!canAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  const repo = createPrismaDudasRepository();
  const [dudas, respuestas] = await Promise.all([repo.listarDudas(), repo.listarRespuestas()]);
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(csvDeRespuestas(filasDeRespuestas(dudas, respuestas)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dudas-catalogo-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
