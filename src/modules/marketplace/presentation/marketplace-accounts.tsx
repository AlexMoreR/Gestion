"use client";

import * as React from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { accountTone, type AccountView } from "@/modules/marketplace/domain/marketplace-monitor";
import { Card, fmt, TONE_DOT } from "./marketplace-ui";

const TONE_LABEL = { ok: "En vivo", warn: "No responde o en pausa", bad: "Posible bloqueo o caída", neutral: "" } as const;

// Una fila por cuenta con su semaforo y lo que hizo en el periodo (como la tabla "Por cuenta" de NETMAGI).
export function AccountsSection({ accounts, days }: { accounts: AccountView[]; days: number }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? accounts : accounts.filter((account) => account.activa);
  const hidden = accounts.length - accounts.filter((account) => account.activa).length;

  return (
    <Card
      title={`Cuentas · últimos ${days} días`}
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
        <div className="-mx-4 overflow-x-auto px-4">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Publicados</TableHead>
                <TableHead className="text-right">Entrantes</TableHead>
                <TableHead className="text-right">Respuestas</TableHead>
                <TableHead className="text-right">Renovaciones</TableHead>
                <TableHead>Última actividad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((account) => {
                const tone = accountTone(account);
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[tone])} title={TONE_LABEL[tone]} aria-hidden />
                        <span className="sr-only">{TONE_LABEL[tone]}:</span>
                        <span className="truncate">{account.nombre}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(account.publicados)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(account.entrantes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(account.respuestas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(account.renovadas)}</TableCell>
                    <TableCell className="text-muted-foreground">{account.latido}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Verde = en vivo, responde · Amarillo = fuera de Messenger o en pausa · Rojo = posible bloqueo o caída. Se actualiza cada 2 minutos.
      </p>
    </Card>
  );
}
