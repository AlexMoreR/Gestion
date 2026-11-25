"use client";

import * as React from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { accountTone, type AccountView } from "@/modules/marketplace/domain/marketplace-monitor";
import { Card, fmt, TONE_DOT } from "./marketplace-ui";

// Mismo texto que el panel de NETMAGI: el estado sale de la extension (latido, Messenger abierto y Auto ON).
const STATE_TEXT = { en_vivo: "En vivo", fuera: "Fuera de Messenger o bot apagado", sin_conexion: "Sin conexión" } as const;

// Una fila por cuenta: ¿esta activa? (semaforo de la extension) y cuanto atendio en el periodo elegido.
export function AccountsSection({ accounts, days }: { accounts: AccountView[]; days: number }) {
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? accounts : accounts.filter((account) => account.activa);
  const hidden = accounts.length - accounts.filter((account) => account.activa).length;

  return (
    <Card
      title={days === 1 ? "Cuentas · hoy" : `Cuentas · últimos ${days} días`}
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
          <Table className="min-w-[460px]">
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Entrantes</TableHead>
                <TableHead className="text-right">Respuestas</TableHead>
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
                        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[tone])} title={STATE_TEXT[account.estado]} />
                        <span className="sr-only">{STATE_TEXT[account.estado]}</span>
                        <span className="truncate">{account.nombre}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(account.entrantes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(account.respuestas)}</TableCell>
                    <TableCell className="text-muted-foreground">{account.latido}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Verde = conectada, con Messenger o Marketplace abierto y el bot en «Auto: ON» · Amarillo = conectada pero fuera de Messenger o con el bot apagado · Rojo = sin conexión (más de 75 s sin avisar). Se actualiza cada 2 minutos.
      </p>
    </Card>
  );
}
