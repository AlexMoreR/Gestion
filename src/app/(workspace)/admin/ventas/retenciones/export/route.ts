import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { parseWithholdingMonth, withholdingsCsv } from "@/modules/ventas/domain/withholding";
import { getWithholdingReport } from "@/modules/ventas/infrastructure/prisma-withholdings";

// Descarga CSV (abre en Excel) de las retenciones en la fuente de un mes, para el contador.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "sales");
  if (!canAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  const month = parseWithholdingMonth(new URL(request.url).searchParams.get("mes"));
  const report = await getWithholdingReport(month);

  return new Response(withholdingsCsv(report), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="retenciones-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
