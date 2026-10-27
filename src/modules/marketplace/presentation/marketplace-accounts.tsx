"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { AccountView } from "@/modules/marketplace/domain/marketplace-monitor";
import { Card, TONE_DOT } from "./marketplace-ui";

const STATE_TONE = { en_vivo: "ok", fuera: "ok", sin_conexion: "bad" } as const;

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-foreground">
        {value}
        {hint ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}

const orDash = (value: number | null) => (value == null ? "—" : String(value));

// Una fila por cuenta: ¿esta viva o caida?, ¿cuanto publico hoy?, ¿cuantos mensajes y clientes trae?
export function AccountsSection({ accounts }: { accounts: AccountView[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? accounts : accounts.filter((account) => account.activa);
  const hidden = accounts.length - accounts.filter((account) => account.activa).length;

  return (
    <Card
      title="Cuentas"
      action={
        hidden > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted"
          >
            {showAll ? "Ocultar cuentas sin actividad" : `Ver ${hidden} cuenta${hidden === 1 ? "" : "s"} sin actividad`}
          </button>
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No hay cuentas registradas.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((account) => (
            <li key={account.id} className="grid gap-x-4 gap-y-2 rounded-lg border border-border/70 p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] md:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[STATE_TONE[account.estado]])} aria-hidden />
                  <span className="truncate">{account.nombre}</span>
                  {account.pausa ? (
                    <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">En pausa</span>
                  ) : account.publica ? (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Publica</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {account.estadoTexto} · último latido {account.latido}
                </p>
                {account.pausa ? <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{account.pausa}</p> : null}
              </div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Publicados hoy" value={orDash(account.publicadosHoy)} hint={account.publica && account.tope ? `/ ${account.tope}` : undefined} />
                <Metric label="Mensajes hoy" value={orDash(account.mensajesHoy)} />
                <Metric label="Clientes 7 días" value={orDash(account.clientes7d)} />
                <Metric label="Ciudad" value={account.ubicacion || "—"} />
              </dl>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Caída = sin latido hace más de 75 segundos (navegador apagado o extensión sin recargar). El estado se actualiza cada minuto.
      </p>
    </Card>
  );
}
