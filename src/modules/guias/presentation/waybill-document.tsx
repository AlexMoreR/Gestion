import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { PublicShipmentView } from "../domain/public-view";
import { formatWeightKg } from "../domain/weight";

// Recuadro formal de la guia (documento tipo comprobante): marca, fila Fecha expedicion | Ciudad
// origen | Ciudad destino | Nº guia | Peso, banda FORMA DE PAGO, REMITE | RECIBE y nota de datos
// parciales. Lo usa la pagina /guia/<token>/documento. Solo usa la vista publica (public-view.ts).

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

export function BrandMark({
  logoUrl,
  brandName,
  size = "lg",
}: {
  logoUrl?: string;
  brandName: string;
  size?: "lg" | "sm";
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={brandName}
        width={160}
        height={56}
        className={cn("w-auto shrink-0 object-contain", size === "lg" ? "h-8 max-w-[34vw] sm:h-12 sm:max-w-none" : "h-9")}
        unoptimized
      />
    );
  }
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap font-black tracking-tight text-[#42066E]",
        size === "lg" ? "text-lg sm:text-[26px]" : "text-xl",
      )}
    >
      {brandName}
    </span>
  );
}

// Titulo de la guia: marca + "Nº DE GUÍA <codigo>". El codigo nunca se parte: en celular
// angosto la letra se achica con el ancho.
export function GuideTitle({ code, logoUrl, brandName }: { code: string; logoUrl?: string; brandName: string }) {
  return (
    <header className="flex items-center gap-3 border-b-[3px] border-[#42066E] px-4 py-3 sm:gap-4 sm:px-[22px] sm:py-4">
      <BrandMark logoUrl={logoUrl} brandName={brandName} />
      <h1 className="ml-auto shrink-0 whitespace-nowrap text-right text-[clamp(16px,5.4vw,22px)] font-extrabold leading-[1.05] tracking-tight text-[#42066E] sm:text-[26px] lg:text-[28px]">
        <small className="block text-[11px] font-semibold tracking-[3px] text-slate-500">Nº DE GUÍA</small>
        <span className="whitespace-nowrap">{code}</span>
      </h1>
    </header>
  );
}

// Celda del recuadro formal. Los bordes entre celdas los pone la fila (WAYBILL_ROW).
function WaybillCell({
  label,
  children,
  nowrap = false,
  className,
}: {
  label: string;
  children: ReactNode;
  nowrap?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 border-[#d7d7de] px-3 py-2", className)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500">{label}</p>
      <p className={cn("mt-0.5 text-[13px] font-bold text-[#42066E]", nowrap ? "whitespace-nowrap" : "break-words")}>
        {children}
      </p>
    </div>
  );
}

// Fila de 5 celdas: en celular 2 columnas (la 5a ocupa las dos), desde md (y al imprimir) una sola fila.
const WAYBILL_ROW =
  "grid grid-cols-2 border-t border-[#d7d7de] md:grid-cols-5 print:grid-cols-5 " +
  "[&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t " +
  "md:[&>*]:border-l md:[&>*:first-child]:border-l-0 md:[&>*:nth-child(n+3)]:border-t-0 " +
  "print:[&>*]:border-l print:[&>*:first-child]:border-l-0 print:[&>*:nth-child(n+3)]:border-t-0";

// En celular la etiqueta va arriba y el valor abajo, para que valores como el telefono
// enmascarado ("*** *** 9108") no se partan en dos renglones.
function PartyRow({ label, children, nowrap = false }: { label: string; children: ReactNode; nowrap?: boolean }) {
  return (
    <p className="my-0.5 text-[13px] text-[#1f2430]">
      <span className="block text-[11px] font-semibold text-slate-500 sm:inline-block sm:min-w-[66px] print:inline-block print:min-w-[66px]">
        {label}
      </span>{" "}
      <span className={cn(nowrap && "whitespace-nowrap")}>{children}</span>
    </p>
  );
}

export function WaybillDocument({
  view,
  logoUrl,
  brandName,
  whatsAppDisplay,
}: {
  view: PublicShipmentView;
  logoUrl?: string;
  brandName: string;
  whatsAppDisplay?: string;
}) {
  // Los eventos llegan del mas reciente al mas antiguo: el ultimo es la creacion de la guia.
  const firstEvent = view.events.length > 0 ? view.events[view.events.length - 1] : null;
  const destination = view.destinationCity ?? "Tu ciudad";
  const weightLabel = formatWeightKg(view.weightKg) ?? "Por confirmar";

  return (
    <section className="overflow-hidden rounded-lg border border-[#d7d7de] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <div className="flex items-start gap-3 px-3 py-2.5">
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
      <div className={WAYBILL_ROW}>
        <WaybillCell label="Fecha expedición" nowrap>
          {firstEvent ? formatShortDate(firstEvent.at) : "—"}
        </WaybillCell>
        <WaybillCell label="Ciudad origen">{view.originCity}</WaybillCell>
        <WaybillCell label="Ciudad destino">{destination}</WaybillCell>
        <WaybillCell label="Nº guía" nowrap>
          {view.code}
        </WaybillCell>
        <WaybillCell label="Peso" nowrap className="col-span-2 md:col-span-1 print:col-span-1">
          {weightLabel}
        </WaybillCell>
      </div>
      <div className="border-t border-[#d7d7de] bg-[#42066E] px-2.5 py-2 text-center text-sm font-extrabold uppercase tracking-[1px] text-white">
        <small className="block text-[10px] font-semibold tracking-[2px] opacity-85">Forma de pago</small>
        {view.amountToCollect > 0 ? `Paga al recibir ${formatCop(view.amountToCollect)}` : "Pago completo"}
      </div>
      <div className="grid grid-cols-2 border-t border-[#d7d7de]">
        <div className="min-w-0 px-3 py-2">
          <p className="mb-1 text-[11px] font-extrabold tracking-[1px] text-[#42066E]">REMITE</p>
          <PartyRow label="Nombre">{brandName}</PartyRow>
          <PartyRow label="Ciudad">Bogotá, D.C.</PartyRow>
          <PartyRow label="Origen">Fábrica {brandName}</PartyRow>
        </div>
        <div className="min-w-0 border-l border-[#d7d7de] px-3 py-2">
          <p className="mb-1 text-[11px] font-extrabold tracking-[1px] text-[#42066E]">RECIBE</p>
          <PartyRow label="Nombre">{view.recipientName ?? "—"}</PartyRow>
          <PartyRow label="Ciudad">{destination}</PartyRow>
          <PartyRow label="Teléfono" nowrap>
            {view.phoneMasked ?? "—"}
          </PartyRow>
        </div>
      </div>
      <p className="border-t border-[#d7d7de] bg-[#fafafb] px-3 py-2 text-[10.5px] leading-normal text-slate-500">
        El envío es despachado por {brandName} desde su fábrica en Bogotá, con transporte aliado a nivel nacional. Por
        tu seguridad, el teléfono y la dirección se muestran parcialmente.
      </p>
    </section>
  );
}
