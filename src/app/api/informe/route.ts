import { NextResponse, type NextRequest } from "next/server";
import { computeMonthlyReport, previousMonthKey, reportToken } from "@/lib/monthly-report";

// Informe mensual en JSON, protegido por token largo (reportToken()).
// Uso: /api/informe?token=XXXX&month=2026-06  (month opcional: por defecto el mes pasado)
export async function GET(request: NextRequest) {
  const expected = reportToken();
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 404 });
  }

  const month = request.nextUrl.searchParams.get("month") || previousMonthKey();
  const report = await computeMonthlyReport(month);
  if (!report) {
    return NextResponse.json({ error: "Mes invalido (usa YYYY-MM)" }, { status: 400 });
  }

  return NextResponse.json(report);
}
