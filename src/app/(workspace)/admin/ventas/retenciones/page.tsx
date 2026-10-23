import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";

import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { getSystemCurrency } from "@/lib/system-settings";
import { bogotaDateKey, parseWithholdingMonth } from "@/modules/ventas/domain/withholding";
import { getWithholdingReport } from "@/modules/ventas/infrastructure/prisma-withholdings";

// Retenciones en la fuente por mes (para la declaracion de renta). Una retencion es un abono que
// la empresa cliente se quedo y pago a la DIAN a nombre de Magilus: cuenta como pagado en la venta,
// pero no entra a ninguna cuenta. Se agrupa por la fecha del abono, en hora de Colombia.

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("es", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function AdminVentasRetencionesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "sales");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const month = parseWithholdingMonth(params.mes);
  const [currency, report] = await Promise.all([getSystemCurrency(), getWithholdingReport(month)]);
  const year = month.slice(0, 4);

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/admin/ventas" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Ventas
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Retenciones en la fuente</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Lo que las empresas clientes retuvieron y pagaron a la DIAN a nombre de Magilus. Cuenta como pagado en
            la venta, pero no entra a ninguna cuenta. Sirve para la declaración de renta.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/admin/ventas/retenciones?mes=${shiftMonth(month, -1)}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="px-2 text-sm font-medium capitalize tabular-nums">{monthLabel(month)}</span>
          <Link
            href={`/admin/ventas/retenciones?mes=${shiftMonth(month, 1)}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <a
            href={`/admin/ventas/retenciones/export?mes=${month}`}
            className="ml-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar Excel (CSV)
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total del mes</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{formatMoney(report.monthTotal, currency)}</p>
          <p className="text-xs text-muted-foreground">{report.rows.length} retención(es)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total del año {year}</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{formatMoney(report.yearTotal, currency)}</p>
          <p className="text-xs text-muted-foreground">
            {report.byMonth.length > 0
              ? report.byMonth.map((row) => `${monthLabel(row.month)}: ${formatMoney(row.total, currency)}`).join(" · ")
              : "Sin retenciones este año"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {report.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Venta</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">NIT/Cédula</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor retenido</th>
                  <th className="py-2 font-medium">Certificado</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 tabular-nums">{bogotaDateKey(row.date)}</td>
                    <td className="py-2 pr-3 font-medium">{row.saleCode}</td>
                    <td className="py-2 pr-3">{row.clientName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.clientTaxId ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.amount, currency)}</td>
                    <td className="py-2 text-muted-foreground">{row.certificate ?? "—"}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3" colSpan={4}>
                    Total
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(report.monthTotal, currency)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
            No hay retenciones en {monthLabel(month)}. Se registran desde Ventas → Registrar abono → cuenta
            &quot;Retención en la fuente&quot;.
          </div>
        )}
      </div>
    </section>
  );
}
