import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";
import type { SaleProfit } from "@/modules/balances/domain/entities";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import {
  groupByMonth,
  metaAdsWithoutAd,
  type OriginReportRow,
  type OriginReportSale,
  type OriginReportTotals,
  reportTotals,
  summarizeByAd,
  summarizeByOrigin,
} from "@/modules/ventas/domain/sale-origin-report";
import { SaleOriginBadge } from "@/modules/ventas/presentation/sale-origin-badge";

// Reporte de ventas por origen (Meta Ads, Marketplace, Referido, Recurrente, Mostrador, Sin dato).
//
// CRITERIO (el mismo de Balances, el informe mensual y el MCP del asesor): entran las ventas
// pagadas por completo (INVOICED) con su orden entregada (COMPLETED), en el mes de ENTREGA
// (ultima linea "Cerrada" del historial). Facturacion = sale.total; ganancia = la de Balances.
// Por eso se reutiliza listProfitReport de Balances en vez de recalcular aqui.

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Año en curso en hora de Colombia (mismo ajuste que la pagina de Balances).
function resolveYear(raw: unknown): number {
  const bogotaNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const current = bogotaNow.getUTCFullYear();
  const parsed = typeof raw === "string" && /^\d{4}$/.test(raw) ? Number(raw) : current;
  return parsed >= 2020 && parsed <= current + 1 ? parsed : current;
}

async function listRecognizedSales(period: { from: Date; to: Date }): Promise<SaleProfit[]> {
  const balances = createPrismaBalancesRepository();
  const rows: SaleProfit[] = [];
  for (let page = 1; ; page += 1) {
    const result = await balances.listProfitReport({ page, pageSize: 500, period });
    rows.push(...result.items);
    if (page >= result.pageCount) break;
  }
  return rows;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("es", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function OriginTable({
  rows,
  totals,
  currency,
}: {
  rows: OriginReportRow[];
  totals: OriginReportTotals;
  currency: SupportedCurrencyCode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Origen</th>
            <th className="py-2 pr-3 text-right font-medium"># Ventas</th>
            <th className="py-2 pr-3 text-right font-medium">Facturación</th>
            <th className="py-2 pr-3 text-right font-medium">% fact.</th>
            <th className="py-2 pr-3 text-right font-medium">Ganancia</th>
            <th className="py-2 text-right font-medium">Ticket promedio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.origin} className="border-b border-border/60">
              <td className="py-2 pr-3">
                <SaleOriginBadge origin={row.origin} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{row.count}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.revenue, currency)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.revenueShare}%</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(row.profit, currency)}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(row.averageTicket, currency)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2 pr-3">Total</td>
            <td className="py-2 pr-3 text-right tabular-nums">{totals.count}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(totals.revenue, currency)}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{totals.count > 0 ? "100%" : "0%"}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(totals.profit, currency)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(totals.averageTicket, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminVentasOrigenPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "sales");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const year = resolveYear(params.anio);
  const period = { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };

  const [currency, recognized] = await Promise.all([getSystemCurrency(), listRecognizedSales(period)]);
  const origins = recognized.length
    ? await prisma.sale.findMany({
        where: { id: { in: recognized.map((row) => row.saleId) } },
        select: { id: true, origin: true, originDetail: true },
      })
    : [];
  const originById = new Map(origins.map((row) => [row.id, row]));

  const sales: OriginReportSale[] = recognized.map((row) => ({
    saleId: row.saleId,
    recognizedAt: row.createdAt,
    amount: row.saleAmount,
    profit: row.netProfit,
    origin: originById.get(row.saleId)?.origin ?? null,
    originDetail: originById.get(row.saleId)?.originDetail ?? null,
  }));

  const yearRows = summarizeByOrigin(sales);
  const yearTotals = reportTotals(sales);
  const months = groupByMonth(sales);
  const ads = summarizeByAd(sales);
  const metaWithoutAd = metaAdsWithoutAd(sales);
  const withOriginPct =
    yearTotals.count > 0
      ? Math.round(((yearTotals.count - (yearRows.find((row) => row.origin === "SIN_DATO")?.count ?? 0)) / yearTotals.count) * 100)
      : 0;

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/admin/ventas" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Ventas
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Ventas por origen · {year}</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Ventas pagadas y entregadas, en el mes de entrega (mismo criterio de Balances). El origen sale de la línea
            de WhatsApp del chat en el CRM. &quot;Sin dato&quot; = ventas sin origen registrado.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/admin/ventas/origen?anio=${year - 1}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
            aria-label="Año anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="px-2 text-sm font-medium tabular-nums">{year}</span>
          <Link
            href={`/admin/ventas/origen?anio=${year + 1}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
            aria-label="Año siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Total del año</h2>
          <p className="text-xs text-muted-foreground">Ventas con origen: {withOriginPct}% (meta ≥ 80 %)</p>
        </div>
        <OriginTable rows={yearRows} totals={yearTotals} currency={currency} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Por campaña / anuncio</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Anuncio</th>
                <th className="py-2 pr-3 text-right font-medium"># Ventas</th>
                <th className="py-2 pr-3 text-right font-medium">Facturación</th>
                <th className="py-2 pr-3 text-right font-medium">Ganancia</th>
                <th className="py-2 text-right font-medium">Ticket promedio</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((ad) => (
                <tr key={ad.key} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    <p className="text-foreground">{ad.adTitle ?? "Anuncio sin título"}</p>
                    {ad.adId ? <p className="text-[11px] text-muted-foreground">id {ad.adId}</p> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{ad.count}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(ad.revenue, currency)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(ad.profit, currency)}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(ad.averageTicket, currency)}</td>
                </tr>
              ))}
              {/* Siempre visible: lo que vino de Meta Ads pero sin anuncio identificado. */}
              <tr className="text-muted-foreground">
                <td className="py-2 pr-3">Meta Ads sin anuncio identificado (sin dato)</td>
                <td className="py-2 pr-3 text-right tabular-nums">{metaWithoutAd.count}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(metaWithoutAd.revenue, currency)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(metaWithoutAd.profit, currency)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(metaWithoutAd.averageTicket, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {months.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No hay ventas pagadas y entregadas en {year}.
        </p>
      ) : (
        months.map((month) => (
          <div key={month.month} className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold capitalize text-foreground">{monthLabel(month.month)}</h2>
            <OriginTable rows={month.rows} totals={month.totals} currency={currency} />
          </div>
        ))
      )}
    </section>
  );
}
