"use client";

import { Siren } from "lucide-react";

import { cn } from "@/lib/utils";
import { agoText, ALERT_LABEL, openAlerts, SEVERE_ALERTS } from "@/modules/marketplace/domain/marketplace-monitor";
import type { AlertaRow, CuentaRow } from "@/modules/marketplace/domain/marketplace-stats";

// Franja de alertas arriba del dashboard (T-503): una linea por problema abierto de una cuenta.
// Rojo = bloqueo o caida (la cuenta no sirve); ambar = el resto. Sin alertas no se muestra nada.
export function AlertsStrip({ alertas, cuentas, now }: { alertas: readonly AlertaRow[]; cuentas: readonly CuentaRow[] | null; now: string }) {
  const open = openAlerts(alertas);
  if (open.length === 0) return null;
  const nameOf = (id: string) => cuentas?.find((c) => c.id === id)?.nombre ?? `Cuenta ${id}`;
  const severe = open.some((alert) => SEVERE_ALERTS.includes(alert.tipo));
  const sorted = [...open].sort((a, b) => Number(SEVERE_ALERTS.includes(b.tipo)) - Number(SEVERE_ALERTS.includes(a.tipo)) || a.abierta_en.localeCompare(b.abierta_en));
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border p-4",
        severe ? "border-red-500/50 bg-red-500/10" : "border-amber-500/50 bg-amber-500/10",
      )}
    >
      <p className={cn("flex items-center gap-2 text-sm font-semibold", severe ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>
        <Siren className="h-4 w-4 shrink-0" aria-hidden />
        {open.length === 1 ? "1 cuenta con un problema abierto" : `${open.length} problemas abiertos en las cuentas`}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-foreground">
        {sorted.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{nameOf(alert.cuenta_id)}</span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                SEVERE_ALERTS.includes(alert.tipo)
                  ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400"
                  : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              {ALERT_LABEL[alert.tipo]}
            </span>
            <span className="text-muted-foreground">
              {alert.mensaje} · desde {agoText(alert.abierta_en, now)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">NETMAGI revisa las cuentas cada 5 minutos. Una alerta se cierra sola cuando el problema se arregla.</p>
    </div>
  );
}
