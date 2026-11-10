import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { devolucionesCsv, filtrarDevoluciones, parseFiltrosDevolucion } from "@/lib/order-return";
import { listDevolucionFilas } from "@/lib/order-returns-report.server";

// Descarga CSV (abre en Excel) de la vista «Devoluciones», con los mismos filtros de la página.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  const filtros = parseFiltrosDevolucion(Object.fromEntries(new URL(request.url).searchParams));
  const filas = filtrarDevoluciones(await listDevolucionFilas(), filtros);

  return new Response(devolucionesCsv(filas), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="devoluciones${filtros.mes ? `-${filtros.mes}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
