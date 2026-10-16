import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";

import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { getSystemCurrency } from "@/lib/system-settings";
import { getCommissionsBoardUseCase } from "@/modules/asesor/application/use-cases";
import { currentMonthInBogota } from "@/modules/asesor/domain/calculations";
import { createPrismaAsesorRepository } from "@/modules/asesor/infrastructure/prisma-asesor-repository";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { loadFixedCommissionRates } from "@/modules/nomina/infrastructure/prisma-nomina-repository";

// Comisiones de las asesoras del mes (solo dueno/admin).
//
// No hay calculo propio aqui: se reutiliza el caso de uso del asesor (el mismo de la
// herramienta MCP comisiones_del_mes), que a su vez toma las ventas y la ganancia de Balances.
// Regla: 10% de la ganancia en la primera venta del mes de cada vendedora y 15% desde la segunda,
// en orden de la fecha en que cuenta cada venta; ganancia <= 0 no genera comision.
// Vendedora = quien creo la cotizacion.

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function resolveMonth(raw: unknown): { mes: number; anio: number } {
  if (typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw)) {
    const [anio, mes] = raw.split("-").map(Number);
    if (mes >= 1 && mes <= 12 && anio >= 2020 && anio <= 2100) {
      return { mes, anio };
    }
  }
  return currentMonthInBogota();
}

function monthValue(mes: number, anio: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

function shiftMonth(mes: number, anio: number, delta: number): string {
  const date = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return monthValue(date.getUTCMonth() + 1, date.getUTCFullYear());
}

function monthLabel(mes: number, anio: number): string {
  return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function PendingDeliveryBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      Falta entregar
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function AdminComisionesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  // Solo el dueno/admin: el modulo esta reservado (un empleado nunca lo recibe).
  const canAccess =
    session.user.role === "ADMIN" && (await hasAdminModuleAccess(session.user.id, session.user.role, "commissions"));
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const { mes, anio } = resolveMonth(params.mes);
  const current = currentMonthInBogota();
  const isCurrentMonth = current.mes === mes && current.anio === anio;

  const [currency, board] = await Promise.all([
    getSystemCurrency(),
    getCommissionsBoardUseCase(
      {
        balances: createPrismaBalancesRepository(),
        asesor: createPrismaAsesorRepository(),
        loadFixedCommissionRates: loadFixedCommissionRates(),
      },
      mes,
      anio,
    ),
  ]);
  const money = (value: number) => formatMoney(value, currency as SupportedCurrencyCode);
  const adminSellers = board.sellers.filter((seller) => seller.isAdmin);

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold capitalize tracking-tight text-foreground">
            Comisiones · {monthLabel(mes, anio)}
          </h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {board.rates.first}% de la ganancia en la primera venta del mes de cada asesora y {board.rates.next}% desde la
            segunda, en orden de la fecha en que cuenta cada venta (salvo quien tenga comisión fija pactada en Nómina). Cuentan las ventas pagadas por completo, aunque falte
            entregarlas (en la fecha del pago que completó el total); la contraentrega cuenta al entregarse; las canceladas no.
            Ganancia cero o negativa no genera comisión. Asesora = quien creó la cotización.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/admin/comisiones?mes=${shiftMonth(mes, anio, -1)}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <form action="/admin/comisiones" className="flex items-center gap-1.5">
            <input
              type="month"
              name="mes"
              defaultValue={monthValue(mes, anio)}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm tabular-nums"
              aria-label="Mes"
            />
            <button type="submit" className="h-8 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted">
              Ver
            </button>
          </form>
          <Link
            href={`/admin/comisiones?mes=${shiftMonth(mes, anio, 1)}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          {!isCurrentMonth ? (
            <Link
              href="/admin/comisiones"
              className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
            >
              Mes actual
            </Link>
          ) : null}
          <Link
            href={`/admin/comisiones/nomina?mes=${monthValue(mes, anio)}`}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Nómina y pagos
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Comisiones del mes" value={money(board.totals.commission)} />
        <Stat label="Ventas que cuentan" value={String(board.totals.salesCount)} hint={board.totals.pendingDeliveryCount > 0 ? `${board.totals.pendingDeliveryCount} falta(n) entregar` : undefined} />
        <Stat label="Valor vendido" value={money(board.totals.saleAmount)} />
        <Stat label="Ganancia" value={money(board.totals.profit)} />
      </div>

      {board.totals.pendingDeliveryCount > 0 || adminSellers.length > 0 || board.unassigned ? (
        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {board.totals.pendingDeliveryCount > 0 ? (
            <p className="flex gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Las ventas &quot;Falta entregar&quot; ya cuentan (están pagadas). Su comisión puede bajar si al despachar se
              registra un flete o cambia el costo de la proveedora.
            </p>
          ) : null}
          {adminSellers.length > 0 ? (
            <p className="flex gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Hay cotizaciones creadas por un usuario administrador ({adminSellers.map((seller) => seller.name).join(", ")}).
              Por ahora se les calcula comisión con la misma regla; pendiente de confirmar si deben generarla.
            </p>
          ) : null}
          {board.unassigned ? (
            <p className="flex gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {board.unassigned.salesCount} venta(s) no tienen cotización con creador: salen en &quot;Sin asignar&quot; y no
              generan comisión.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Resumen por asesora</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Asesora</th>
                <th className="py-2 pr-3 text-right font-medium"># Ventas</th>
                <th className="py-2 pr-3 text-right font-medium">Valor vendido</th>
                <th className="py-2 pr-3 text-right font-medium">Ganancia</th>
                <th className="py-2 text-right font-medium">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {board.sellers.map((seller) => (
                <tr key={seller.sellerId} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    <a href={`#asesora-${seller.sellerId}`} className="text-foreground hover:underline">
                      {seller.name}
                    </a>
                    {seller.isAdmin ? <span className="ml-1.5 text-[11px] text-muted-foreground">(admin)</span> : null}
                    {seller.fixedRatePct !== null ? (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">({seller.fixedRatePct}% fijo)</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{seller.salesCount}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(seller.saleAmount)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(seller.profit)}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{money(seller.commission)}</td>
                </tr>
              ))}
              {board.unassigned ? (
                <tr className="border-b border-border/60 text-muted-foreground">
                  <td className="py-2 pr-3">Sin asignar (sin comisión)</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{board.unassigned.salesCount}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(board.unassigned.saleAmount)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(board.unassigned.profit)}</td>
                  <td className="py-2 text-right tabular-nums">{money(0)}</td>
                </tr>
              ) : null}
              <tr className="font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 text-right tabular-nums">{board.totals.salesCount}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(board.totals.saleAmount)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(board.totals.profit)}</td>
                <td className="py-2 text-right tabular-nums">{money(board.totals.commission)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {board.sellers.length === 0 && !board.unassigned ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No hay ventas que cuenten en {monthLabel(mes, anio)}.
        </p>
      ) : null}

      {board.sellers.map((seller) => (
        <div key={seller.sellerId} id={`asesora-${seller.sellerId}`} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {seller.name}
              {seller.isAdmin ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(admin)</span> : null}
            </h2>
            <p className="text-xs text-muted-foreground">
              {seller.salesCount} venta(s) · comisión <span className="font-semibold text-foreground">{money(seller.commission)}</span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Venta</th>
                  <th className="py-2 pr-3 font-medium">Cuenta desde</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor</th>
                  <th className="py-2 pr-3 text-right font-medium">Ganancia</th>
                  <th className="py-2 pr-3 text-right font-medium">%</th>
                  <th className="py-2 text-right font-medium">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {seller.lines.map((line) => (
                  <tr key={line.saleCode} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">{line.numberInMonth}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-foreground">{line.saleCode}</span>
                      {line.pendingDelivery ? (
                        <div className="mt-1">
                          <PendingDeliveryBadge />
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{dayLabel(line.recognizedDay)}</td>
                    <td className="py-2 pr-3">{line.clientName ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(line.saleAmount)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {money(line.profit)}
                      {line.note ? <p className="text-[11px] text-muted-foreground">No genera comisión</p> : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{line.ratePct}%</td>
                    <td className="py-2 text-right font-medium tabular-nums">{money(line.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {board.unassigned ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Sin asignar</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Ventas sin cotización o con cotización sin creador: no se sabe qué asesora las hizo y no generan comisión.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Venta</th>
                  <th className="py-2 pr-3 font-medium">Cuenta desde</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor</th>
                  <th className="py-2 text-right font-medium">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {board.unassigned.lines.map((line) => (
                  <tr key={line.saleCode} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-foreground">{line.saleCode}</span>
                      {line.pendingDelivery ? (
                        <div className="mt-1">
                          <PendingDeliveryBadge />
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{dayLabel(line.recognizedDay)}</td>
                    <td className="py-2 pr-3">{line.clientName ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(line.saleAmount)}</td>
                    <td className="py-2 text-right tabular-nums">{money(line.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
