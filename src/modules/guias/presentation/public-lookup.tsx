"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, MapPin, MessageCircle, Package, Wallet } from "lucide-react";
import { publicLookupShipmentAction, type LookupState } from "@/app/actions/shipment-public-actions";
import { cn } from "@/lib/utils";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {pending ? "Consultando..." : "Consultar"}
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

export function PublicLookup({ whatsAppHref }: { whatsAppHref: string }) {
  const [state, formAction] = useActionState<LookupState, FormData>(publicLookupShipmentAction, { status: "idle" });
  const view = state.status === "ok" ? state.view : null;
  const helpHref = `${whatsAppHref}${whatsAppHref.includes("?") ? "&" : "?"}text=${encodeURIComponent(
    view ? `Hola Magilus, tengo una pregunta sobre mi guía ${view.code}` : "Hola Magilus, necesito ayuda con mi guía",
  )}`;

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
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-500">Guía {view.code}</p>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-semibold",
                  view.status === "DELIVERED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-900 text-white",
                )}
              >
                {view.statusLabel}
              </span>
            </div>
            <p className="text-xl font-bold text-slate-900">{view.statusText}</p>

            <ol className="grid grid-cols-5 gap-1">
              {view.steps.map((step) => (
                <li key={step.label} className="space-y-1">
                  <div className={cn("h-2 rounded-full", step.done ? "bg-emerald-500" : "bg-slate-200")} />
                  <p className={cn("text-[11px] leading-tight", step.done ? "font-semibold text-slate-900" : "text-slate-400")}>
                    {step.label}
                  </p>
                </li>
              ))}
            </ol>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> Recorrido
                </p>
                <p className="mt-1 text-sm text-slate-900">
                  {view.originCity} → {view.destinationCity ?? "tu ciudad"}
                </p>
                {view.currentCity && view.status !== "DELIVERED" ? (
                  <p className="text-xs text-slate-600">Último reporte: {view.currentCity}</p>
                ) : null}
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" /> {view.status === "DELIVERED" ? "Entregado" : "Entrega estimada"}
                </p>
                <p className="mt-1 text-sm font-semibold capitalize text-slate-900">
                  {view.status === "DELIVERED" && view.deliveredAt
                    ? formatStamp(view.deliveredAt)
                    : view.estimatedDelivery
                      ? formatDay(view.estimatedDelivery)
                      : "Por confirmar"}
                </p>
                {view.etaChanged && view.status !== "DELIVERED" ? (
                  <p className="text-xs text-amber-700">La fecha se actualizó por una novedad en la vía.</p>
                ) : null}
              </div>
            </div>

            <div
              className={cn(
                "flex items-center gap-3 rounded-xl p-3",
                view.amountToCollect > 0 ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900",
              )}
            >
              <Wallet className="h-5 w-5 shrink-0" />
              <p className="text-base font-semibold">
                {view.amountToCollect > 0
                  ? `Al recibir pagas ${formatCop(view.amountToCollect)}`
                  : view.status === "DELIVERED"
                    ? "Pedido entregado"
                    : "Al recibir no pagas nada: tu pedido ya está pago"}
              </p>
            </div>

            {view.deliveryPhotoUrl ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Foto de entrega
                  {view.receivedBy ? <span className="font-normal text-slate-500">· Recibió: {view.receivedBy}</span> : null}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={view.deliveryPhotoUrl} alt="Foto de entrega" className="max-h-80 w-full rounded-xl object-cover" />
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Package className="h-4 w-4" /> Movimientos
            </p>
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {view.events.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-900" />
                  <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatStamp(event.at)}
                    {event.city ? ` · ${event.city}` : ""}
                  </p>
                  {event.detail ? <p className="mt-0.5 text-sm text-slate-700">{event.detail}</p> : null}
                </li>
              ))}
            </ol>
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
