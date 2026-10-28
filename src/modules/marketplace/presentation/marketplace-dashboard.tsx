"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, PlugZap, RefreshCw } from "lucide-react";

import type { SupportedCurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  bogotaDate,
  bogotaHour,
  buildAccountViews,
  buildChart,
  buildTodayCards,
} from "@/modules/marketplace/domain/marketplace-monitor";
import { type ChannelSales, type NetmagiStats, RANGE_OPTIONS } from "@/modules/marketplace/domain/marketplace-stats";
import { AccountsSection } from "./marketplace-accounts";
import { AdsSection, type ProductLink } from "./marketplace-ads";
import { TrendChart } from "./marketplace-chart";
import { DetailSection } from "./marketplace-detail";
import { FormulaSection } from "./marketplace-formula";
import { TodayCards, VerdictBanner } from "./marketplace-today";

type Props = {
  days: number;
  desde: string; // inicio de la ventana elegida (7, 30 o 90 dias)
  hasta: string;
  fetchDesde: string; // inicio de lo que se pidio a NETMAGI (al menos 30 dias, para el grafico y las comparaciones)
  now: string; // hora del servidor al armar la pagina (ISO)
  stats: NetmagiStats;
  channel: ChannelSales | null;
  currency: SupportedCurrencyCode;
  productLinks: Record<string, ProductLink>;
};

const REFRESH_MS = 2 * 60 * 1000;

// Se vuelve a pedir la pagina cada 2 minutos mientras la pestana esta a la vista (NETMAGI guarda las
// cuentas 1 min y el resto 5 min, asi que no se le pega mas seguido de lo que ya responde).
function useAutoRefresh() {
  const router = useRouter();
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);
  return () => router.refresh();
}

export function MarketplaceDashboard({ days, desde, hasta, fetchDesde, now, stats, channel, currency, productLinks }: Props) {
  const refresh = useAutoRefresh();
  const resumen = stats.resumen;
  const today = bogotaDate(now);
  const hour = bogotaHour(now);

  const today_ = React.useMemo(
    () => (resumen ? buildTodayCards({ resumen, cuentas: stats.cuentas, publicador: stats.publicador, today, hour }) : null),
    [resumen, stats.cuentas, stats.publicador, today, hour],
  );
  const accounts = React.useMemo(() => buildAccountViews(stats.cuentas ?? [], stats.publicador, now), [stats.cuentas, stats.publicador, now]);
  const chart = React.useMemo(() => (resumen ? buildChart(resumen.serie, 30) : null), [resumen]);

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Marketplace</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Hoy es {today} (hora Bogotá) · Datos de NETMAGI, sin nombres ni mensajes de clientes. Se actualiza solo cada 2 minutos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" aria-label="Periodo de las tablas">
            {RANGE_OPTIONS.map((option) => (
              <Link
                key={option}
                href={`/admin/marketplace?dias=${option}`}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  option === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {option} días
              </Link>
            ))}
          </div>
        </div>
      </div>

      {!stats.ok || !resumen || !today_ || !chart ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
          <PlugZap className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No se pudieron traer las estadísticas de NETMAGI</p>
          <p className="max-w-md text-xs text-muted-foreground">{stats.error ?? "NETMAGI no respondió."} Intenta de nuevo en unos minutos.</p>
        </div>
      ) : (
        <>
          {stats.error ? (
            <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Algunas secciones no cargaron: {stats.error}
            </p>
          ) : null}

          <VerdictBanner verdict={today_.verdict} today={today} />
          <TodayCards cards={today_.cards} />

          <AccountsSection accounts={accounts} />

          <AdsSection
            // Si cambia el periodo (7/30/90) se reinician los filtros de fecha.
            key={`${desde}|${hasta}`}
            anuncios={stats.anuncios}
            faltan={stats.anunciosFaltan}
            links={productLinks}
            currency={currency}
            desde={desde}
            hasta={hasta}
            fetchDesde={fetchDesde}
          />

          <FormulaSection formula={stats.formula} faltan={stats.formulaFaltan} />

          <TrendChart points={chart.points} startLabel={chart.startLabel} />

          <DetailSection stats={stats} channel={channel} currency={currency} desde={fetchDesde} hasta={hasta} />
        </>
      )}
    </section>
  );
}
