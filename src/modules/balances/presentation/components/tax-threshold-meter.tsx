"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { computeTaxThresholds, type ThresholdStatus } from "@/modules/balances/domain/tax-thresholds";

type TaxThresholdMeterProps = {
  currency: SupportedCurrencyCode;
  annualSales: number;
  salesCount: number;
  uvt: number;
  year: number;
};

const STATUS_STYLES: Record<
  ThresholdStatus,
  { bar: string; badge: string; label: string; Icon: typeof Info }
> = {
  ok: {
    bar: "bg-emerald-500",
    badge: "text-emerald-600",
    label: "En rango",
    Icon: CheckCircle2,
  },
  warning: {
    bar: "bg-amber-500",
    badge: "text-amber-600",
    label: "Acercandote",
    Icon: AlertTriangle,
  },
  danger: {
    bar: "bg-orange-500",
    badge: "text-orange-600",
    label: "Muy cerca",
    Icon: AlertTriangle,
  },
  over: {
    bar: "bg-destructive",
    badge: "text-destructive",
    label: "Superado",
    Icon: ShieldAlert,
  },
};

export function TaxThresholdMeter({
  currency,
  annualSales,
  salesCount,
  uvt,
  year,
}: TaxThresholdMeterProps) {
  const meters = computeTaxThresholds(annualSales, uvt);

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Topes DIAN {year}</h3>
            <p className="text-xs text-muted-foreground">
              Ventas acumuladas del anio: {formatMoney(annualSales, currency)} · {salesCount} ventas
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <Info className="h-3 w-3" />
            UVT {formatMoney(uvt, currency)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {meters.map((meter) => {
            const style = STATUS_STYLES[meter.status];
            const clampedPercent = Math.min(100, Math.max(0, meter.percent));

            return (
              <div key={meter.key} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{meter.label}</p>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${style.badge}`}>
                    <style.Icon className="h-3.5 w-3.5" />
                    {meter.percent.toFixed(0)}%
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${style.bar}`}
                    style={{ width: `${clampedPercent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Tope: {formatMoney(meter.limitAmount, currency)}</span>
                  <span className={style.badge}>
                    {meter.status === "over"
                      ? "Superado"
                      : `Faltan ${formatMoney(meter.remaining, currency)}`}
                  </span>
                </div>

                <p className="text-[11px] leading-snug text-muted-foreground">{meter.description}</p>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          Calculado sobre tus ventas reales del anio (sin borradores ni canceladas). Las
          consignaciones bancarias tienen su propio tope de IVA; controlalas aparte.
        </p>
      </CardContent>
    </Card>
  );
}
