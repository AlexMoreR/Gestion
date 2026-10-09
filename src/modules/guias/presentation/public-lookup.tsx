"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, FileText, Loader2, MessageCircle, Search, Truck } from "lucide-react";
import { publicLookupShipmentAction, type LookupState } from "@/app/actions/shipment-public-actions";
import { cn } from "@/lib/utils";
import type { PublicShipmentView } from "../domain/public-view";
import { formatWeightKg } from "../domain/weight";
import { GuideTitle } from "./waybill-document";

// Pagina 1 "Estado del envio": titulo con Nº de guia, progreso con camion, entrega estimada,
// cajas de datos, estado actual, foto de entrega e historial. El documento formal (recuadro tipo
// comprobante) vive aparte en /guia/<token>/documento, al que lleva el boton "Ver guia".
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

// Fila de las cajas superiores: etiqueta en celda gris, valor en morado. Los codigos de guia
// van con nowrap para que nunca se partan en dos renglones.
function BoxRow({ label, children, nowrap = false }: { label: string; children: ReactNode; nowrap?: boolean }) {
  return (
    <div className="grid grid-cols-[104px_1fr] border-t border-[#d7d7de] first:border-t-0 sm:grid-cols-[120px_1fr]">
      <dt className="flex items-center bg-[#f1f1f4] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </dt>
      <dd
        className={cn(
          "flex min-w-0 items-center px-3 py-1.5 text-[13px] font-semibold text-[#42066E]",
          nowrap ? "whitespace-nowrap" : "break-words",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

// Animaciones del camion (solo CSS). Las clases motion-safe:* las desactivan si el usuario
// pide reducir movimiento; las lineas de velocidad se ocultan con motion-reduce:hidden.
const TRUCK_KEYFRAMES = `
@keyframes guia-truck-ride {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-1.5px) rotate(-1.5deg); }
  50% { transform: translateY(0) rotate(0deg); }
  75% { transform: translateY(-1px) rotate(1deg); }
}
@keyframes guia-speed-line {
  0% { transform: translateX(4px); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: translateX(-10px); opacity: 0; }
}
@keyframes guia-shimmer {
  from { background-position: 0 0; }
  to { background-position: 28px 0; }
}
`;

// Barra de progreso continua con un camion parado en el paso actual (al final del tramo lleno).
// En curso: el camion "anda" (rebote leve + lineas de velocidad) y el tramo lleno tiene un rayado
// que avanza. Entregado: el camion se detiene al final con un check verde.
function ProgressTrack({ steps, delivered }: { steps: { label: string; done: boolean }[]; delivered: boolean }) {
  const total = Math.max(steps.length, 1);
  const doneCount = steps.filter((step) => step.done).length;
  const moving = doneCount > 0 && !delivered;
  // Centro de la columna del paso actual, para que el camion quede sobre su etiqueta.
  const truckPos = doneCount > 0 ? ((doneCount - 0.5) / total) * 100 : 0;
  const fillPos = delivered ? 100 : truckPos;

  return (
    <div>
      <style>{TRUCK_KEYFRAMES}</style>
      <div className="relative h-8">
        <div className="absolute bottom-0 -translate-x-1/2" style={{ left: `${truckPos}%` }}>
          {moving ? (
            <span aria-hidden className="absolute right-full top-1/2 mr-0.5 flex -translate-y-1/2 flex-col gap-[3px] motion-reduce:hidden">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "block h-[2px] rounded-full bg-[#42066E]/60 animate-[guia-speed-line_0.9s_linear_infinite]",
                    i === 1 ? "ml-0 w-3" : "ml-1 w-2",
                  )}
                  style={{ animationDelay: `${i * 0.25}s` }}
                />
              ))}
            </span>
          ) : null}
          <span
            className={cn(
              "relative block",
              moving && "motion-safe:animate-[guia-truck-ride_0.6s_ease-in-out_infinite]",
            )}
          >
            <Truck className="h-6 w-6 text-[#42066E]" strokeWidth={2.25} aria-hidden />
            {delivered ? (
              <CheckCircle2
                className="absolute -right-2 -top-1.5 h-4 w-4 rounded-full bg-white text-emerald-600"
                aria-hidden
              />
            ) : null}
          </span>
        </div>
      </div>
      <div
        className="relative mt-0.5 h-2 overflow-hidden rounded-full bg-[#e2e2e8]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={doneCount}
        aria-label={delivered ? "Entregado" : `Paso ${doneCount} de ${total}`}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            delivered ? "bg-emerald-600" : "bg-[#42066E]",
            moving &&
              "bg-[linear-gradient(115deg,rgba(255,255,255,0.28)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.28)_50%,rgba(255,255,255,0.28)_75%,transparent_75%)] bg-[length:28px_100%] motion-safe:animate-[guia-shimmer_0.9s_linear_infinite]",
          )}
          style={{ width: `${fillPos}%` }}
        />
      </div>
      <ol className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          return (
            <li
              key={step.label}
              className={cn(
                "text-center text-[10.5px] leading-tight",
                delivered && isLast
                  ? "font-bold text-emerald-700"
                  : step.done
                    ? "font-semibold text-[#1f2430]"
                    : "text-[#9aa0ab]",
              )}
            >
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type EventRow = { id: string; at: string; title: string; observation: ReactNode };

// FECHA | ESTADO | OBSERVACION. En celular se apila (fecha + estado arriba, observacion abajo)
// para no partir palabras como "Recogido" o "Guía creada"; desde sm se muestra como tabla.
function EventRows({ rows, size = "sm" }: { rows: EventRow[]; size?: "sm" | "md" }) {
  const text = size === "md" ? "text-[13px]" : "text-[12.5px]";
  const pad = size === "md" ? "py-2" : "py-1.5";
  return (
    <>
      <ul className={cn("divide-y divide-[#d7d7de] sm:hidden", text)}>
        {rows.map((row) => (
          <li key={row.id} className={cn("px-3", pad)}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="whitespace-normal font-bold text-[#42066E]">{row.title}</span>
              <span className="whitespace-nowrap text-[11px] text-slate-500">{formatStamp(row.at)}</span>
            </div>
            <div className="mt-0.5 text-[#1f2430]">{row.observation}</div>
          </li>
        ))}
      </ul>
      <table className={cn("hidden w-full table-fixed border-collapse sm:table", text)}>
        <thead>
          <tr className="bg-[#42066E] text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-white">
            <th className="w-[24%] px-3 py-1.5">Fecha</th>
            <th className="w-[24%] px-3 py-1.5">Estado</th>
            <th className="px-3 py-1.5">Observación</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#d7d7de] align-top">
              <td className={cn("px-3 text-[#1f2430]", pad)}>{formatStamp(row.at)}</td>
              <td className={cn("whitespace-normal px-3 font-bold text-[#42066E]", pad)}>{row.title}</td>
              <td className={cn("whitespace-normal px-3 text-[#1f2430]", pad)}>{row.observation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type EventItem = { id: string; at: string; title: string; detail: string | null; city: string | null };

function EventsTable({ events }: { events: EventItem[] }) {
  return (
    <EventRows
      rows={events.map((event) => ({
        id: event.id,
        at: event.at,
        title: event.title,
        observation: (
          <>
            {event.city ? <span className="block text-[11px] text-slate-500">{event.city}</span> : null}
            {event.detail ? <span>{event.detail}</span> : !event.city ? "—" : null}
          </>
        ),
      }))}
    />
  );
}

type PublicLookupProps = {
  whatsAppHref: string;
  logoUrl?: string;
  brandName?: string;
  /** Enlace directo (/guia/[token]) valido: la guia se muestra sin pedir datos. */
  initialView?: PublicShipmentView | null;
  /** Enlace directo invalido: aviso amable sobre el formulario normal. */
  initialNotice?: string;
};

function initialLookupState(view?: PublicShipmentView | null, notice?: string): LookupState {
  if (view) {
    return { status: "ok", view };
  }
  return notice ? { status: "error", error: notice } : { status: "idle" };
}

// "Consultar otra guía" cambia la key y remonta el formulario: el estado de useActionState
// vuelve a "idle" y los campos quedan vacios (la guia del enlace directo ya no se repite).
export function PublicLookup({ initialView, initialNotice, ...props }: PublicLookupProps) {
  const [resetKey, setResetKey] = useState(0);
  const initialState = resetKey === 0 ? initialLookupState(initialView, initialNotice) : initialLookupState();
  return <LookupPanel key={resetKey} {...props} initialState={initialState} onReset={() => setResetKey((k) => k + 1)} />;
}

function LookupPanel({
  whatsAppHref,
  logoUrl,
  brandName = "Magilus",
  initialState,
  onReset,
}: PublicLookupProps & { initialState: LookupState; onReset: () => void }) {
  const [state, formAction] = useActionState<LookupState, FormData>(publicLookupShipmentAction, initialState);
  const view = state.status === "ok" ? state.view : null;
  const guideRef = useRef<HTMLElement>(null);

  // Al aparecer la guia, llevarla al inicio de la pantalla (en celular quedaba a mitad de pagina).
  useEffect(() => {
    if (view) {
      guideRef.current?.scrollIntoView({ block: "start" });
    }
  }, [view]);
  const helpHref = `${whatsAppHref}${whatsAppHref.includes("?") ? "&" : "?"}text=${encodeURIComponent(
    view ? `Hola ${brandName}, tengo una pregunta sobre mi guía ${view.code}` : `Hola ${brandName}, necesito ayuda con mi guía`,
  )}`;
  const delivered = view?.status === "DELIVERED";
  // Los eventos llegan del mas reciente al mas antiguo.
  const latestEvent = view?.currentEvent ?? null;
  const destination = view?.destinationCity ?? "Tu ciudad";
  const weightLabel = formatWeightKg(view?.weightKg) ?? "Por confirmar";

  return (
    <div className="space-y-5">
      {/* Con una guia en pantalla solo se ve la guia: se ocultan titulo, texto y formulario. */}
      {view ? null : (
        <>
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Consulte su envío</h1>
        <p className="mt-1 text-sm text-slate-600">
          Escribe tu número de guía {brandName} (empieza por MG) y los últimos 4 dígitos de tu celular.
        </p>
      </div>
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
        </>
      )}

      {view ? (
        <article
          ref={guideRef}
          className="scroll-mt-4 overflow-hidden rounded-[10px] border border-[#d7d7de] bg-white text-[#1f2430] shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
          {/* 1. Titulo: marca + Nº de guia */}
          <GuideTitle code={view.code} logoUrl={logoUrl} brandName={brandName} />

          {/* 2. Progreso (de primero) con el camion + entrega estimada pegada debajo */}
          <div className="px-4 pt-3 sm:px-[22px]">
            <p className="mb-1 text-[15px] font-bold">{view.statusText}</p>
            <ProgressTrack steps={view.steps} delivered={delivered} />
            <div className="mt-2.5 rounded-lg border border-[#d7d7de] bg-[#f1f1f4] px-3 py-2 text-[13px]">
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
              {view.etaDelayReason && !delivered ? (
                <span className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  La fecha se movió por: {view.etaDelayReason}.
                </span>
              ) : null}
            </div>
          </div>

          {/* 3. Dos cajas parejas (3 filas cada una, misma altura; grid-rows-3 reparte el alto).
              El estado ya se ve en la barra de progreso y en la franja de abajo. */}
          <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2 sm:px-[22px]">
            <dl className="grid grid-rows-3 overflow-hidden rounded-lg border border-[#d7d7de]">
              <BoxRow label="Remisión" nowrap>
                {view.code}
              </BoxRow>
              <BoxRow label="Origen">{view.originCity}</BoxRow>
              <BoxRow label="Peso (kg)">{weightLabel}</BoxRow>
            </dl>
            <dl className="grid grid-rows-3 overflow-hidden rounded-lg border border-[#d7d7de]">
              <BoxRow label="Destinatario">{view.recipientName ?? "—"}</BoxRow>
              <BoxRow label="Teléfono" nowrap>
                {view.phoneMasked ?? "—"}
              </BoxRow>
              <BoxRow label="Destino">{destination}</BoxRow>
            </dl>
          </div>

          {/* Boton a la pagina 2: el documento formal de la guia (para imprimir o guardar en PDF). */}
          {view.documentToken ? (
            <div className="flex px-4 pb-3 sm:px-[22px]">
              <a
                href={`/guia/${encodeURIComponent(view.documentToken)}/documento`}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#42066E] text-[15px] font-semibold text-white sm:ml-auto sm:w-auto sm:px-5"
              >
                <FileText className="h-5 w-5" aria-hidden /> Ver guía
              </a>
            </div>
          ) : null}

          {/* 4. Estado actual: FECHA | ESTADO | OBSERVACION */}
          {latestEvent ? (
            <div className="px-4 pb-1 sm:px-[22px]">
              <div className="overflow-hidden rounded-lg border border-[#d7d7de]">
                <EventRows
                  size="md"
                  rows={[
                    {
                      id: latestEvent.id,
                      at: latestEvent.at,
                      title: latestEvent.title,
                      observation: latestEvent.detail ?? latestEvent.city ?? view.currentCity ?? "—",
                    },
                  ]}
                />
              </div>
            </div>
          ) : null}

          {/* Foto de entrega */}
          {view.deliveryPhotoUrl ? (
            <div className="mx-4 mt-3 space-y-2 overflow-hidden rounded-lg border border-[#d7d7de] p-3 sm:mx-[22px]">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Foto de entrega
                {view.receivedBy ? <span className="font-normal text-slate-500">· Recibió: {view.receivedBy}</span> : null}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.deliveryPhotoUrl} alt="Foto de entrega" className="max-h-80 w-full rounded-lg object-cover" />
            </div>
          ) : null}

          {/* 6. Historial completo */}
          <section className="mx-4 mb-4 mt-3 overflow-hidden rounded-lg border border-[#d7d7de] sm:mx-[22px]">
            <p className="flex items-center gap-2 border-b border-[#d7d7de] px-3 py-2 text-xs font-bold uppercase tracking-[0.05em] text-slate-500">
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

      {view ? (
        <button
          type="button"
          onClick={() => {
            onReset();
            window.scrollTo({ top: 0 });
          }}
          className="mx-auto flex items-center justify-center gap-1.5 text-sm font-semibold text-[#42066E] underline underline-offset-4"
        >
          <Search className="h-4 w-4" /> Consultar otra guía
        </button>
      ) : null}
    </div>
  );
}
