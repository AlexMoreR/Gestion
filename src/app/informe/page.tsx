import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/currency";
import { computeMonthlyReport, previousMonthKey, type MonthlyReportProduct } from "@/lib/monthly-report";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function pickString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function InformeMesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const expected = process.env.MONTHLY_REPORT_TOKEN ?? "";
  const token = pickString(params.token);
  // Sin token configurado o token incorrecto => 404 (no revela que la ruta existe).
  if (!expected || token !== expected) {
    notFound();
  }

  const month = pickString(params.month) || previousMonthKey();
  const [report, currency] = await Promise.all([computeMonthlyReport(month), getSystemCurrency()]);
  if (!report) {
    notFound();
  }

  const jsonHref = `/api/informe?token=${encodeURIComponent(token)}&month=${encodeURIComponent(report.monthKey)}`;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Informe del mes</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{report.monthLabel}</h1>
        <a href={jsonHref} className="mt-1 inline-block text-sm text-blue-600 underline">
          Ver en JSON
        </a>
      </header>

      {/* Resumen */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ventas del mes" value={formatMoney(report.sales.total, currency)} />
        <Stat label="Pedidos entregados" value={String(report.sales.count)} />
        <Stat label="Utilidad total" value={formatMoney(report.profit.net, currency)} />
        <Stat label="Margen promedio" value={`${report.profit.marginPct.toFixed(2)}%`} />
      </section>

      {/* Top productos */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProductTable
          title="Top 5 productos por ventas"
          subtitle="Los que más facturan"
          rows={report.topByRevenue}
          highlight="revenue"
          currency={currency}
        />
        <ProductTable
          title="Top 5 productos por margen"
          subtitle="Los que dejan más utilidad"
          rows={report.topByMargin}
          highlight="margin"
          currency={currency}
        />
      </div>

      {/* Cotizaciones */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Cotizaciones</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Hechas" value={String(report.quotes.made)} />
          <Stat label="Cerradas (con venta)" value={String(report.quotes.closed)} />
          <Stat label="Tasa de cierre" value={`${report.quotes.closeRatePct.toFixed(1)}%`} />
        </div>
      </section>

      <p className="mt-8 text-xs text-slate-400">
        Ventas y utilidad reconocidas por mes de entrega. Costos = proveedores + envíos.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ProductTable({
  title,
  subtitle,
  rows,
  highlight,
  currency,
}: {
  title: string;
  subtitle: string;
  rows: MonthlyReportProduct[];
  highlight: "revenue" | "margin";
  currency: Parameters<typeof formatMoney>[1];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="text-xs text-slate-500">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sin datos en el mes.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1 font-medium">Producto</th>
              <th className="py-1 text-right font-medium">Uds.</th>
              <th className="py-1 text-right font-medium">Ventas</th>
              <th className="py-1 text-right font-medium">Margen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productId} className="border-t border-slate-100">
                <td className="py-1.5">
                  <span className="font-medium text-slate-900">{row.name}</span>{" "}
                  <span className="text-xs text-slate-400">{row.code}</span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-600">{row.units}</td>
                <td
                  className={`py-1.5 text-right tabular-nums ${highlight === "revenue" ? "font-semibold text-slate-900" : "text-slate-600"}`}
                >
                  {formatMoney(row.revenue, currency)}
                </td>
                <td
                  className={`py-1.5 text-right tabular-nums ${highlight === "margin" ? "font-semibold text-emerald-600" : "text-slate-600"}`}
                >
                  {formatMoney(row.margin, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
