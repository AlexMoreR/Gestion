"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, MessageCircle, Search } from "lucide-react";
import { publicLookupShipmentAction, type LookupState } from "@/app/actions/shipment-public-actions";
import { cn } from "@/lib/utils";

// Resultado de la consulta con formato de guia de transporte (estilo documento): titulo con
// Nº de guia, cajas de datos, estado actual, progreso, recuadro formal e historial.
// Solo usa lo que expone shipment-lookup.ts: nunca direccion, telefono completo, transportadora,
// guia del proveedor ni valores del flete.

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

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCop(value: number): string {
  return value.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// "+57 304 648 1994" -> "304 648 1994" (se muestra el numero local, como en el borrador).
function formatWhatsApp(display: string): string {
  return display.replace(/^\+57\s*/, "").trim() || display;
}

function BrandMark({ logoUrl, brandName, size = "lg" }: { logoUrl?: string; brandName: string; size?: "lg" | "sm" }) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={brandName}
        width={160}
        height={56}
        className={cn("w-auto shrink-0 object-contain", size === "lg" ? "h-10 sm:h-12" : "h-9")}
        unoptimized
      />
    );
  }
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap font-black tracking-tight text-[#42066E]",
        size === "lg" ? "text-xl sm:text-[26px]" : "text-xl",
      )}
    >
      {brandName}
    </span>
  );
}

// Fila de las cajas superiores: etiqueta en celda gris, valor en morado.
function BoxRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] border-t border-[#d7d7de] first:border-t-0 sm:grid-cols-[130px_1fr]">
      <dt className="flex items-center bg-[#f1f1f4] px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center break-words px-3 py-2.5 text-sm font-semibold text-[#42066E]">
        {children}
      </dd>
    </div>
  );
}

function WaybillCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-[#d7d7de] px-3 py-2.5 [&:nth-child(3)]:border-l-0 sm:[&:nth-child(3)]:border-l first:border-l-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500">{label}</p>
      <p className="mt-0.5 break-words text-sm font-bold text-[#42066E]">{children}</p>
    </div>
  );
}

function PartyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="my-1 text-[13px] text-[#1f2430]">
      <span className="inline-block min-w-[66px] text-[11px] font-semibold text-slate-500">{label}</span> {children}
    </p>
  );
}

type EventItem = { id: string; at: string; title: string; detail: string | null; city: string | null };

function EventsTable({ events }: { events: EventItem[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <thead>
        <tr className="bg-[#42066E] text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-white">
          <th className="w-[34%] px-3 py-2">Fecha</th>
          <th className="w-[28%] px-3 py-2">Estado</th>
          <th className="px-3 py-2">Observación</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id} className="border-t border-[#d7d7de] align-top">
            <td className="px-3 py-2.5 text-[#1f2430]">{formatStamp(event.at)}</td>
            <td className="break-words px-3 py-2.5 font-bold text-[#42066E]">{event.title}</td>
            <td className="break-words px-3 py-2.5 text-[#1f2430]">
              {event.city ? <span className="block text-[11px] text-slate-500">{event.city}</span> : null}
              {event.detail ? <span>{event.detail}</span> : !event.city ? "—" : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PublicLookup({
  whatsAppHref,
  whatsAppDisplay,
  logoUrl,
  brandName = "Magilus",
}: {
  whatsAppHref: string;
  whatsAppDisplay?: string;
  logoUrl?: string;
  brandName?: string;
}) {
  const [state, formAction] = useActionState<LookupState, FormData>(publicLookupShipmentAction, { status: "idle" });
  const view = state.status === "ok" ? state.view : null;
  const helpHref = `${whatsAppHref}${whatsAppHref.includes("?") ? "&" : "?"}text=${encodeURIComponent(
    view ? `Hola ${brandName}, tengo una pregunta sobre mi guía ${view.code}` : `Hola ${brandName}, necesito ayuda con mi guía`,
  )}`;
  const delivered = view?.status === "DELIVERED";
  // Los eventos llegan del mas reciente al mas antiguo.
  const latestEvent = view?.events[0] ?? null;
  const firstEvent = view && view.events.length > 0 ? view.events[view.events.length - 1] : null;
  const destination = view?.destinationCity ?? "Tu ciudad";

  return (
    <div className="space-y-5">
      <form
        action={formAction}
        className="mx-auto max-w-xl space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      >
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
            placeholder="MG-7K4Q2P8X"
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
        <article className="overflow-hidden rounded-[10px] border border-[#d7d7de] bg-white text-[#1f2430] shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          {/* 1. Titulo: marca + Nº de guia */}
          <header className="flex items-center gap-4 border-b-[3px] border-[#42066E] px-4 py-4 sm:px-[22px] sm:py-5">
            <BrandMark logoUrl={logoUrl} brandName={brandName} />
            <h2 className="ml-auto min-w-0 text-right text-[22px] font-extrabold leading-[1.05] tracking-tight text-[#42066E] sm:text-[30px]">
              <small className="block text-[12px] font-semibold tracking-[3px] text-slate-500">Nº DE GUÍA</small>
              <span className="break-all">{view.code}</span>
            </h2>
          </header>

          {/* 2. Dos cajas */}
          <div className="grid grid-cols-1 gap-3.5 px-4 py-4 sm:grid-cols-2 sm:px-[22px]">
            <dl className="overflow-hidden rounded-lg border border-[#d7d7de]">
              <BoxRow label="Remisión">{view.code}</BoxRow>
              <BoxRow label="Origen">{view.originCity}</BoxRow>
              <BoxRow label="Estado">{view.statusLabel}</BoxRow>
            </dl>
            <dl className="overflow-hidden rounded-lg border border-[#d7d7de]">
              <BoxRow label="Destinatario">{view.recipientName ?? "—"}</BoxRow>
              <BoxRow label="Teléfono">{view.phoneMasked ?? "—"}</BoxRow>
              <BoxRow label="Destino">{destination}</BoxRow>
            </dl>
          </div>

          {/* 3. Estado actual: FECHA | ESTADO | OBSERVACION */}
          {latestEvent ? (
            <div className="px-4 pb-1.5 sm:px-[22px]">
              <div className="overflow-hidden rounded-lg border border-[#d7d7de]">
                <table className="w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#42066E] text-left text-[11px] font-bold uppercase tracking-[0.05em] text-white">
                      <th className="w-[34%] px-3 py-2">Fecha</th>
                      <th className="w-[28%] px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#d7d7de] align-top">
                      <td className="px-3 py-3">{formatStamp(latestEvent.at)}</td>
                      <td className="break-words px-3 py-3 font-bold text-[#42066E]">{latestEvent.title}</td>
                      <td className="break-words px-3 py-3">
                        {latestEvent.detail ?? latestEvent.city ?? view.currentCity ?? "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* 4. Progreso */}
          <div className="px-4 pb-1 pt-3 sm:px-[22px]">
            <p className="mb-2.5 text-base font-bold">{view.statusText}</p>
            <ol className="grid grid-cols-5 gap-1.5">
              {view.steps.map((step) => (
                <li key={step.label}>
                  <div className={cn("h-2 rounded-full", step.done ? "bg-[#42066E]" : "bg-[#e2e2e8]")} />
                  <p
                    className={cn(
                      "mt-1.5 text-[10.5px] leading-tight",
                      step.done ? "font-semibold text-[#1f2430]" : "text-[#9aa0ab]",
                    )}
                  >
                    {step.label}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {/* Entrega estimada / entregado + aviso de fecha cambiada */}
          <div className="mx-4 mt-3.5 rounded-lg border border-[#d7d7de] bg-[#f1f1f4] px-3.5 py-2.5 text-sm sm:mx-[22px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
              {delivered ? "Entregado" : "Entrega estimada"}
            </span>
            <span className="ml-2 font-bold capitalize text-[#42066E]">
              {delivered && view.deliveredAt
                ? formatStamp(view.deliveredAt)
                : view.estimatedDelivery
                  ? formatDay(view.estimatedDelivery)
                  : "Por confirmar"}
            </span>
            {view.etaChanged && !delivered ? (
              <span className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                La fecha se actualizó por una novedad en la vía.
              </span>
            ) : null}
          </div>

          {/* Foto de entrega */}
          {view.deliveryPhotoUrl ? (
            <div className="mx-4 mt-3.5 space-y-2 overflow-hidden rounded-lg border border-[#d7d7de] p-3.5 sm:mx-[22px]">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Foto de entrega
                {view.receivedBy ? <span className="font-normal text-slate-500">· Recibió: {view.receivedBy}</span> : null}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.deliveryPhotoUrl} alt="Foto de entrega" className="max-h-80 w-full rounded-lg object-cover" />
            </div>
          ) : null}

          {/* 5. Recuadro formal */}
          <section className="mx-4 mb-1.5 mt-3.5 overflow-hidden rounded-lg border border-[#d7d7de] sm:mx-[22px]">
            <div className="flex items-start gap-3.5 p-3.5">
              <BrandMark logoUrl={logoUrl} brandName={brandName} size="sm" />
              <p className="text-[11.5px] leading-normal text-slate-500">
                <b className="text-[#1f2430]">{brandName} · Fábrica Bogotá</b>
                {whatsAppDisplay ? (
                  <>
                    <br />
                    WhatsApp {formatWhatsApp(whatsAppDisplay)}
                  </>
                ) : null}
                <br />
                magilus.com · Envíos a toda Colombia
              </p>
            </div>
            <div className="grid grid-cols-2 border-t border-[#d7d7de] sm:grid-cols-4 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-[#d7d7de] sm:[&>*:nth-child(n+3)]:border-t-0">
              <WaybillCell label="Fecha expedición">{firstEvent ? formatShortDate(firstEvent.at) : "—"}</WaybillCell>
              <WaybillCell label="Ciudad origen">{view.originCity}</WaybillCell>
              <WaybillCell label="Ciudad destino">{destination}</WaybillCell>
              <WaybillCell label="Nº guía">{view.code}</WaybillCell>
            </div>
            <div className="border-t border-[#d7d7de] bg-[#42066E] p-2.5 text-center font-extrabold uppercase tracking-[1px] text-white">
              <small className="block text-[10px] font-semibold tracking-[2px] opacity-85">Forma de pago</small>
              {view.amountToCollect > 0 ? `Paga al recibir ${formatCop(view.amountToCollect)}` : "Pago completo"}
            </div>
            <div className="grid grid-cols-2 border-t border-[#d7d7de]">
              <div className="min-w-0 px-3.5 py-3">
                <p className="mb-1.5 text-[11px] font-extrabold tracking-[1px] text-[#42066E]">REMITE</p>
                <PartyRow label="Nombre">{brandName}</PartyRow>
                <PartyRow label="Ciudad">Bogotá, D.C.</PartyRow>
                <PartyRow label="Origen">Fábrica {brandName}</PartyRow>
              </div>
              <div className="min-w-0 border-l border-[#d7d7de] px-3.5 py-3">
                <p className="mb-1.5 text-[11px] font-extrabold tracking-[1px] text-[#42066E]">RECIBE</p>
                <PartyRow label="Nombre">{view.recipientName ?? "—"}</PartyRow>
                <PartyRow label="Ciudad">{destination}</PartyRow>
                <PartyRow label="Teléfono">{view.phoneMasked ?? "—"}</PartyRow>
              </div>
            </div>
            <p className="border-t border-[#d7d7de] bg-[#fafafb] px-3.5 py-2.5 text-[10.5px] leading-normal text-slate-500">
              El envío es despachado por {brandName} desde su fábrica en Bogotá, con transporte aliado a nivel
              nacional. Por tu seguridad, el teléfono y la dirección se muestran parcialmente.
            </p>
          </section>

          {/* 6. Historial completo */}
          <section className="mx-4 mb-5 mt-3.5 overflow-hidden rounded-lg border border-[#d7d7de] sm:mx-[22px]">
            <p className="flex items-center gap-2 border-b border-[#d7d7de] px-3.5 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-slate-500">
              <CalendarDays className="h-4 w-4" /> Historial del envío
            </p>
            {view.events.length > 0 ? (
              <EventsTable events={view.events} />
            ) : (
              <p className="px-3.5 py-3 text-sm text-slate-500">Aún no hay movimientos registrados.</p>
            )}
          </section>
        </article>
      ) : null}

      <a
        href={helpHref}
        target="_blank"
        rel="noreferrer"
        className="mx-auto flex h-12 w-full max-w-xl items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-white text-base font-semibold text-emerald-700"
      >
        <MessageCircle className="h-5 w-5" /> Escríbenos por WhatsApp
      </a>
    </div>
  );
}
