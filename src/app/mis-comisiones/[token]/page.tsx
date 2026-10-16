import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/currency";
import { currentMonthInBogota } from "@/modules/asesor/domain/calculations";
import { createPrismaAsesorRepository } from "@/modules/asesor/infrastructure/prisma-asesor-repository";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { getSellerPortalUseCase } from "@/modules/nomina/application/use-cases";
import { explainSaleLine } from "@/modules/nomina/domain/seller-portal";
import { createPrismaNominaRepository } from "@/modules/nomina/infrastructure/prisma-nomina-repository";
import { findSellerByToken, listOpenQuotesBySeller } from "@/modules/nomina/infrastructure/prisma-seller-portal";

// Link privado de cada asesora (sin iniciar sesion, por enlace secreto): sus ventas del mes,
// su comision explicada venta por venta y lo que ganaria si cierra sus cotizaciones abiertas.
// Nunca muestra costos ni fletes. Se crea y se cambia desde Comisiones -> Nomina.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis comisiones · Magilus",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const money = (value: number) => formatMoney(value, "COP");

function resolveMonth(raw: unknown): { mes: number; anio: number } {
  const current = currentMonthInBogota();
  if (typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw)) {
    const [anio, mes] = raw.split("-").map(Number);
    const isFuture = anio > current.anio || (anio === current.anio && mes > current.mes);
    if (mes >= 1 && mes <= 12 && anio >= 2026 && !isFuture) return { mes, anio };
  }
  return current;
}

const monthValue = (mes: number, anio: number) => `${anio}-${String(mes).padStart(2, "0")}`;

function shift(mes: number, anio: number, delta: number) {
  const date = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return { mes: date.getUTCMonth() + 1, anio: date.getUTCFullYear() };
}

function monthLabel(mes: number, anio: number): string {
  const label = new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function MisComisionesPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const seller = await findSellerByToken(token);
  if (!seller) notFound();

  const query = await searchParams;
  const { mes, anio } = resolveMonth(query.mes);
  const current = currentMonthInBogota();
  const isCurrentMonth = current.mes === mes && current.anio === anio;
  const previous = shift(mes, anio, -1);
  const next = shift(mes, anio, 1);

  const portal = await getSellerPortalUseCase(
    {
      balances: createPrismaBalancesRepository(),
      asesor: createPrismaAsesorRepository(),
      nomina: createPrismaNominaRepository(),
      listOpenQuotes: listOpenQuotesBySeller,
    },
    seller.id,
    mes,
    anio,
  );
  const firstName = seller.name.split(" ")[0];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-700">Magilus · Mis comisiones</p>
          <h1 className="text-2xl font-bold">Hola, {firstName}</h1>
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/mis-comisiones/${token}?mes=${monthValue(previous.mes, previous.anio)}`} className="rounded-md border border-slate-300 bg-white px-2 py-1">
              ←
            </Link>
            <span className="font-medium">{monthLabel(mes, anio)}</span>
            {!isCurrentMonth ? (
              <Link href={`/mis-comisiones/${token}?mes=${monthValue(next.mes, next.anio)}`} className="rounded-md border border-slate-300 bg-white px-2 py-1">
                →
              </Link>
            ) : null}
          </div>
        </header>

        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] text-slate-500">Ventas</p>
            <p className="text-xl font-bold tabular-nums">{portal.totals.salesCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] text-slate-500">Vendido</p>
            <p className="text-base font-bold tabular-nums">{money(portal.totals.saleAmount)}</p>
          </div>
          <div className="rounded-xl border border-violet-300 bg-violet-50 p-3">
            <p className="text-[11px] text-violet-800">Comisión ganada</p>
            <p className="text-base font-bold tabular-nums text-violet-900">{money(portal.totals.commission)}</p>
          </div>
        </section>

        <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">{portal.rule}</p>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Ventas que ya cuentan</h2>
          {portal.sales.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
              Aún no tienes ventas pagadas este mes. ¡Tus cotizaciones de abajo pueden convertirse en comisión!
            </p>
          ) : (
            portal.sales.map((sale) => (
              <article key={sale.saleCode} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{sale.clientName ?? "Cliente"}</p>
                    <p className="text-xs text-slate-500">
                      {dayLabel(sale.day)} · {sale.saleCode} · venta de {money(sale.saleAmount)}
                    </p>
                  </div>
                  <p className="text-base font-bold tabular-nums text-violet-800">{money(sale.commission)}</p>
                </div>
                <p className="mt-1.5 text-xs text-slate-600">{explainSaleLine(sale, money)}</p>
                {sale.pendingDelivery ? (
                  <p className="mt-1 text-[11px] text-amber-700">Falta entregar: la comisión puede cambiar un poco si se suma un flete al despachar.</p>
                ) : null}
              </article>
            ))
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Cotizaciones por cerrar</h2>
            {portal.quotes.length > 0 ? (
              <p className="text-xs text-slate-600">
                Podrías ganar aprox. <span className="font-semibold text-emerald-700">{money(portal.potentialCommission)}</span>
              </p>
            ) : null}
          </div>
          {portal.quotes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
              No tienes cotizaciones abiertas de este mes.
            </p>
          ) : (
            portal.quotes.map((quote) => (
              <article key={quote.quoteCode} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{quote.clientName ?? "Cliente"}</p>
                    <p className="text-xs text-slate-500">
                      {dayLabel(quote.day)} · {quote.quoteCode} · {quote.statusLabel} · {money(quote.total)}
                    </p>
                    {quote.products.length > 0 ? <p className="truncate text-xs text-slate-500">{quote.products.join(", ")}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Si la cierras</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-700">≈ {money(quote.estimatedCommission)}</p>
                  </div>
                </div>
              </article>
            ))
          )}
          {portal.quotes.length > 0 ? (
            <p className="text-[11px] text-slate-500">
              Aproximado con el {portal.nextRatePct}% y el costo de catálogo; el valor final sale de la venta real (fletes y costo
              confirmado con la fábrica).
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
