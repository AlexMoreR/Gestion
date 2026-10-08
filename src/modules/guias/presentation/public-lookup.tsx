"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  Truck,
  Wallet,
} from "lucide-react";
import { publicLookupShipmentAction, type LookupState } from "@/app/actions/shipment-public-actions";
import { cn } from "@/lib/utils";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#42066E] text-base font-semibold text-white disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
      {pending ? "Rastreando..." : "Rastrear"}
    </button>
  );
}

function formatDay(isoDay: string): string {
  return new Date(`${isoDay}T12:00:00Z`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCop(value: number): string {
  return value.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// Fila de la "guía": etiqueta a la izquierda, dato a la derecha.
function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-2.5">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export function PublicLookup({ whatsAppHref, brandName = "Magilus" }: { whatsAppHref: string; brandName?: string }) {
  const [state, formAction] = useActionState<LookupState, FormData>(publicLookupShipmentAction, { status: "idle" });
  const view = state.status === "ok" ? state.view : null;
  const helpHref = `${whatsAppHref}${whatsAppHref.includes("?") ? "&" : "?"}text=${encodeURIComponent(
    view ? `Hola ${brandName}, tengo una pregunta sobre mi guía ${view.code}` : `Hola ${brandName}, necesito ayuda con mi guía`,
  )}`;
  const delivered = view?.status === "DELIVERED";

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-1">
          <label htmlFor="guia-code" className="text-sm font-semibold text-slate-700">
            Número de guía
          </label>
          <input
            id="guia-code"
            name="code"
            required
            autoComplete="off"
            inputMode="text"
            placeholder="MG-000123"
            className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base uppercase"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="guia-last4" className="text-sm font-semibold text-slate-700">
            Últimos 4 dígitos de tu celular
          </label>
          <input
            id="guia-last4"
            name="last4"
            required
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoComplete="off"
            placeholder="1234"
            className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base tracking-[0.3em]"
          />
        </div>
        {state.status === "error" ? (
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {state.error}
          </p>
        ) : null}
        <SubmitButton />
      </form>

      {view ? (
        <div className="space-y-4">
          {/* Guía con marca Magilus */}
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-[#42066E] px-5 py-5 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-violet-200">Nº de guía</p>
              <p className="mt-1 text-3xl font-black leading-none tracking-tight sm:text-4xl">{view.code}</p>
              <span
                className={cn(
                  "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
                  delivered ? "bg-emerald-400 text-emerald-950" : "bg-white text-[#42066E]",
                )}
              >
                {delivered ? <CheckCircle2 className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                {view.statusLabel}
              </span>
            </div>

            <div className="px-5 py-4">
              <p className="text-lg font-bold text-slate-900">{view.statusText}</p>
              <ol className="mt-4 grid grid-cols-5 gap-1">
                {view.steps.map((step) => (
                  <li key={step.label} className="space-y-1">
                    <div className={cn("h-2 rounded-full", step.done ? "bg-[#42066E]" : "bg-slate-200")} />
                    <p
                      className={cn(
                        "text-[11px] leading-tight",
                        step.done ? "font-semibold text-slate-900" : "text-slate-400",
                      )}
                    >
                      {step.label}
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            <dl className="divide-y divide-slate-100 border-t border-slate-100">
              <DataRow label="Remitente">{brandName} · Bogotá</DataRow>
              <DataRow label="Origen">{view.originCity}</DataRow>
              <DataRow label="Destino">{view.destinationCity ?? "Tu ciudad"}</DataRow>
              <DataRow label="Destinatario">{view.recipientName ?? "—"}</DataRow>
              <DataRow label="Teléfono">{view.phoneMasked ?? "—"}</DataRow>
              <DataRow label="Forma de pago">
                {view.amountToCollect > 0 ? (
                  <span className="font-bold text-amber-700">Paga al recibir {formatCop(view.amountToCollect)}</span>
                ) : (
                  "Pago completo"
                )}
              </DataRow>
              <DataRow label={delivered ? "Entregado" : "Entrega estimada"}>
                <span className="capitalize">
                  {delivered && view.deliveredAt
                    ? formatStamp(view.deliveredAt)
                    : view.estimatedDelivery
                      ? formatDay(view.estimatedDelivery)
                      : "Por confirmar"}
                </span>
                {view.etaChanged && !delivered ? (
                  <span className="mt-0.5 block text-xs font-normal text-amber-700">
                    La fecha se actualizó por una novedad en la vía.
                  </span>
                ) : null}
              </DataRow>
            </dl>

            {/* Recorrido ciudad a ciudad (gancho para el mapa) */}
            <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm text-slate-700">
              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
              <span>
                {view.originCity} → {view.destinationCity ?? "tu ciudad"}
                {view.currentCity && !delivered ? (
                  <span className="text-slate-500"> · último reporte: {view.currentCity}</span>
                ) : null}
              </span>
            </div>

            {view.amountToCollect > 0 ? (
              <div className="flex items-center gap-3 border-t border-amber-100 bg-amber-50 px-5 py-3 text-amber-900">
                <Wallet className="h-5 w-5 shrink-0" />
                <p className="text-base font-semibold">Al recibir pagas {formatCop(view.amountToCollect)}</p>
              </div>
            ) : null}

            {view.deliveryPhotoUrl ? (
              <div className="space-y-2 border-t border-slate-100 px-5 py-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Foto de entrega
                  {view.receivedBy ? (
                    <span className="font-normal text-slate-500">· Recibió: {view.receivedBy}</span>
                  ) : null}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={view.deliveryPhotoUrl} alt="Foto de entrega" className="max-h-80 w-full rounded-xl object-cover" />
              </div>
            ) : null}
          </section>

          {/* Historial: FECHA | ESTADO | OBSERVACIÓN */}
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <p className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-4 w-4" /> Historial del envío
            </p>
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-[#42066E] text-left text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                  <th className="w-[34%] px-4 py-2">Fecha</th>
                  <th className="w-[30%] px-2 py-2">Estado</th>
                  <th className="px-2 py-2">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view.events.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="px-4 py-2.5 text-xs text-slate-500">{formatStamp(event.at)}</td>
                    <td className="px-2 py-2.5 font-semibold text-slate-900">{event.title}</td>
                    <td className="px-2 py-2.5 text-slate-700">
                      {event.city ? <span className="block text-xs text-slate-500">{event.city}</span> : null}
                      {event.detail ? <span>{event.detail}</span> : !event.city ? "—" : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      <a
        href={helpHref}
        target="_blank"
        rel="noreferrer"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-white text-base font-semibold text-emerald-700"
      >
        <MessageCircle className="h-5 w-5" /> Escríbenos por WhatsApp
      </a>
    </div>
  );
}
