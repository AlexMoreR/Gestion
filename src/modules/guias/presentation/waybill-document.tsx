import type { ReactNode } from "react";
import Image from "next/image";
import { FACTORY_POINTS } from "@/lib/factory-points";
import { cn } from "@/lib/utils";
import type { DocumentShipmentView } from "../domain/document-view";

// Recuadro formal de la guia (documento tipo comprobante): fila Fecha expedicion | Nº guia |
// Ciudad origen | Ciudad destino, banda FORMA DE PAGO, REMITE | RECIBE (con direcciones)
// y nota de datos parciales. Lo usa solo la pagina /guia/<token>/documento, con la vista del
// documento (document-view.ts).

// Remite: la sede de Bogota (fuente unica: lib/factory-points.ts), de donde sale el despacho.
const BOGOTA_FACTORY = FACTORY_POINTS.find((point) => point.city === "Bogotá");
const SENDER_ADDRESS = BOGOTA_FACTORY ? `${BOGOTA_FACTORY.address}, ${BOGOTA_FACTORY.neighborhood}` : null;
const PENDING = "Por confirmar";

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

// Cabecera unica del documento de la guia: logo + datos de la empresa ("<marca> Transporte",
// WhatsApp, web) a la izquierda y "Nº DE GUÍA <codigo>" a la derecha. En celular, si no cabe
// todo en una fila, el Nº de guia baja a su propio renglon (alineado a la derecha) sin partir
// el codigo. Sale tambien al imprimir. (La pagina de Estado usa GuideTitle, no esta.)
export function WaybillHeader({
  code,
  logoUrl,
  brandName,
  whatsAppDisplay,
}: {
  code: string;
  logoUrl?: string;
  brandName: string;
  whatsAppDisplay?: string;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-[3px] border-[#42066E] px-4 py-3 [print-color-adjust:exact] [-webkit-print-color-adjust:exact] sm:px-[22px] sm:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark logoUrl={logoUrl} brandName={brandName} />
        <p className="min-w-0 break-words text-[11.5px] leading-normal text-slate-500 sm:text-[12.5px]">
          <b className="text-[13px] text-[#1f2430] sm:text-[14px]">{brandName} Transporte</b>
          {whatsAppDisplay ? (
            <>
              <br />
              WhatsApp <span className="whitespace-nowrap">{formatWhatsApp(whatsAppDisplay)}</span>
            </>
          ) : null}
          <br />
          magilus.com · Envíos a toda Colombia
        </p>
      </div>
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

// Fila de 4 celdas: en celular 2x2 (Fecha | Nº guia, Origen | Destino), desde md (y al imprimir) una sola fila.
// Es la primera fila del recuadro: sin borde superior (lo pone el borde del recuadro).
const WAYBILL_ROW =
  "grid grid-cols-2 border-[#d7d7de] md:grid-cols-4 print:grid-cols-4 " +
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

export function WaybillDocument({ view, brandName }: { view: DocumentShipmentView; brandName: string }) {
  // Los eventos llegan del mas reciente al mas antiguo: el ultimo es la creacion de la guia.
  const firstEvent = view.events.length > 0 ? view.events[view.events.length - 1] : null;
  const destination = view.destinationCity ?? "Tu ciudad";

  return (
    <section className="overflow-hidden rounded-lg border border-[#d7d7de] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <div className={WAYBILL_ROW}>
        <WaybillCell label="Fecha expedición" nowrap>
          {firstEvent ? formatShortDate(firstEvent.at) : "—"}
        </WaybillCell>
        <WaybillCell label="Nº guía" nowrap>
          {view.code}
        </WaybillCell>
        <WaybillCell label="Ciudad origen">{view.originCity}</WaybillCell>
        <WaybillCell label="Ciudad destino">{destination}</WaybillCell>
      </div>
      <div className="border-t border-[#d7d7de] bg-[#42066E] px-2.5 py-2 text-center text-sm font-extrabold uppercase tracking-[1px] text-white">
        <small className="block text-[10px] font-semibold tracking-[2px] opacity-85">Forma de pago</small>
        {view.amountToCollect > 0 ? `Paga al recibir ${formatCop(view.amountToCollect)}` : "Pago completo"}
      </div>
      <div className="grid grid-cols-2 border-t border-[#d7d7de]">
        <div className="min-w-0 px-3 py-2">
          <p className="mb-1 text-[11px] font-extrabold tracking-[1px] text-[#42066E]">REMITE</p>
          <PartyRow label="Nombre">{brandName}</PartyRow>
          <PartyRow label="Dirección">{SENDER_ADDRESS ?? PENDING}</PartyRow>
          <PartyRow label="Ciudad">Bogotá, D.C.</PartyRow>
          <PartyRow label="Origen">Fábrica {brandName}</PartyRow>
        </div>
        <div className="min-w-0 border-l border-[#d7d7de] px-3 py-2">
          <p className="mb-1 text-[11px] font-extrabold tracking-[1px] text-[#42066E]">RECIBE</p>
          <PartyRow label="Nombre">{view.recipientName ?? "—"}</PartyRow>
          <PartyRow label="Dirección">{view.recipientAddress ?? PENDING}</PartyRow>
          <PartyRow label="Ciudad">{view.recipientCity ?? destination}</PartyRow>
          <PartyRow label="Teléfono" nowrap>
            {view.phoneMasked ?? "—"}
          </PartyRow>
        </div>
      </div>
      <p className="border-t border-[#d7d7de] bg-[#fafafb] px-3 py-2 text-[10.5px] leading-normal text-slate-500">
        Despachado por {brandName} Transporte con transporte aliado a nivel nacional. Por tu seguridad, el teléfono se
        muestra parcialmente.
      </p>
    </section>
  );
}
