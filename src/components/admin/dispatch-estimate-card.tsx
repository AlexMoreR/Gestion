"use client";

import { useFormStatus } from "react-dom";
import { CalendarClock } from "lucide-react";
import { adminUpdateDispatchEstimateAction } from "@/app/actions/dispatch-actions";
import { DeliveryStateChip } from "@/components/admin/delivery-state-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EstadoEntrega } from "@/lib/delivery-tracking";

// Una línea de la bitácora con el prefijo "Cambió la fecha estimada" (formatNoteDate en `date`).
export type CambioFechaView = { id: string; summary: string; by: string; date: string };

export type DispatchEstimateView = {
  id: string;
  code: string;
  // null = devuelto: se muestra "Devuelto" en vez del chip (un devuelto "ATRASADO" engañaría).
  estado: EstadoEntrega | null;
  // "AAAA-MM-DD HH:MM" hora Colombia, o null si aún no se entrega.
  realEn: string | null;
  // Valor del input datetime-local (colombiaDateTimeInput) o "".
  estimadaInput: string;
  historial: CambioFechaView[];
};

export function SaveDateButton({ label = "Guardar fecha" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" className="h-8 text-xs" disabled={pending}>
      {pending ? "Guardando..." : label}
    </Button>
  );
}

// Historial de cambios de fecha (quién y cuándo), más nuevo primero. Lo usan despachos y OF.
export function FechaHistorial({ items }: { items: CambioFechaView[] }) {
  if (items.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Sin cambios de fecha.</p>;
  }
  return (
    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <li key={item.id} className="break-words">
          <span className="font-medium text-foreground">{item.date}</span> · {item.by}: {item.summary}
        </li>
      ))}
    </ul>
  );
}

// Fechas estimadas de los despachos de la orden: corregirlas deja quién y cuándo en la bitácora.
export function DispatchEstimateCard({ dispatches, returnTo }: { dispatches: DispatchEstimateView[]; returnTo: string }) {
  if (dispatches.length === 0) return null;
  return (
    <Card className="border-border bg-card/95">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Fechas de entrega</h2>
        </div>
        <ul className="space-y-3">
          {dispatches.map((dispatch) => (
            <li key={dispatch.id} className="space-y-2 rounded-lg border border-border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{dispatch.code}</span>
                {dispatch.estado ? (
                  <DeliveryStateChip estado={dispatch.estado} />
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">Devuelto</span>
                )}
                {dispatch.realEn ? (
                  <span className="text-[11px] text-muted-foreground">Entregado el {dispatch.realEn}</span>
                ) : null}
              </div>
              <form action={adminUpdateDispatchEstimateAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="dispatchId" value={dispatch.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label className="min-w-0 flex-1 space-y-1 sm:max-w-60">
                  <span className="text-[11px] font-medium text-muted-foreground">Fecha y hora estimada de entrega</span>
                  <Input
                    type="datetime-local"
                    name="estimatedDeliveryAt"
                    required
                    defaultValue={dispatch.estimadaInput}
                    className="h-8 text-xs"
                  />
                </label>
                <SaveDateButton />
              </form>
              <FechaHistorial items={dispatch.historial} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
