import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { previousMonthKey, reportToken } from "@/lib/monthly-report";

// Devuelve el link del informe (con su token) listo para copiar. Solo para el
// admin logueado, para no exponer el token sin sesion. Uso: abrir estando dentro
// del panel: /api/informe/link  (o /api/informe/link?month=2026-06)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const token = reportToken();
  if (!token) {
    return NextResponse.json(
      { error: "No hay AUTH_SECRET ni MONTHLY_REPORT_TOKEN configurado en el servidor." },
      { status: 500 },
    );
  }

  const month = request.nextUrl.searchParams.get("month") || previousMonthKey();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || request.nextUrl.origin;
  const query = `token=${encodeURIComponent(token)}&month=${encodeURIComponent(month)}`;

  return NextResponse.json({
    month,
    token,
    page: `${origin}/informe?${query}`,
    json: `${origin}/api/informe?${query}`,
  });
}
