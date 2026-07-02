import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { computeDianTaxThresholds, type ThresholdStatus } from "@/lib/dian-tax-thresholds";

type DianTaxThresholdMeterProps = {
  currency: SupportedCurrencyCode;
  annualSales: number;
  salesCount: number;
  uvt: number;
  year: number;
};

const STATUS_STYLES: Record<ThresholdStatus, { bar: string; badge: string; Icon: typeof Info }> = {
  ok: {
    bar: "bg-emerald-500",
    badge: "text-emerald-600",
    Icon: CheckCircle2,
  },
  warning: {
    bar: "bg-amber-500",
    badge: "text-amber-600",
    Icon: AlertTriangle,
  },
  danger: {
    bar: "bg-orange-500",
    badge: "text-orange-600",
    Icon: AlertTriangle,
  },
  over: {
    bar: "bg-destructive",
    badge: "text-destructive",
    Icon: ShieldAlert,
  },
};

export function DianTaxThresholdMeter({
  currency,
  annualSales,
  salesCount,
  uvt,
  year,
}: DianTaxThresholdMeterProps) {
  const meters = computeDianTaxThresholds(annualSales, uvt);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Topes DIAN {year}</h3>
          <p className="text-xs text-muted-foreground">
            Ventas acumuladas del año: {formatMoney(annualSales, currency)} - {salesCount} ventas
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
            <div key={meter.key} className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
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
                  {meter.status === "over" ? "Superado" : `Faltan ${formatMoney(meter.remaining, currency)}`}
                </span>
              </div>

              <p className="text-[11px] leading-snug text-muted-foreground">{meter.description}</p>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Calculado sobre tus ventas reales del año (sin borradores ni canceladas). Las consignaciones bancarias
        tienen su propio tope de IVA; contrólalas aparte.
      </p>
    </div>
  );
}
