import type { Metadata } from "next";
import Image from "next/image";
import { MapPin, Truck } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemBrandName, getSystemCurrency, getSystemStorefrontLogoPath } from "@/lib/system-settings";
import { firstName } from "@/modules/guias/domain/lookup";
import {
  isFinalShipmentStatus,
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_LABEL,
} from "@/modules/guias/domain/statuses";
import type { CityOption } from "@/modules/guias/domain/types";
import { findShipmentByCarrierToken } from "@/modules/guias/infrastructure/shipments-repository";
import { CallButton, CarrierPanel } from "@/modules/guias/presentation/carrier-panel";

// Enlace del transportador (sin cuenta). Muestra lo minimo: guia, destino, primer nombre del
// cliente, cobro al recibir. La direccion solo aparece "En reparto" y el telefono nunca se
// muestra (solo el boton Llamar).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guía Magilus · Transportador",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

function toOption(city: { id: string; name: string; code: string; department: { name: string } } | null): CityOption | null {
  return city ? { id: city.id, name: city.name, code: city.code, departmentName: city.department.name } : null;
}

function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) {
    return `tel:+57${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("57")) {
    return `tel:+${digits}`;
  }
  return digits.length >= 7 ? `tel:${digits}` : null;
}

export default async function CarrierShipmentPage({ params }: PageProps) {
  const { token } = await params;
  const [shipment, brandName, logoPath, currency] = await Promise.all([
    findShipmentByCarrierToken(token),
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    getSystemCurrency(),
  ]);

  const header = (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
        <Image src={getPublicAssetUrl(logoPath)} alt={brandName} width={120} height={40} className="h-8 w-auto object-contain" unoptimized />
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
          <Truck className="h-3.5 w-3.5" /> Transportador
        </span>
      </div>
    </header>
  );

  if (!shipment) {
    return (
      <div className="min-h-screen bg-slate-50">
        {header}
        <main className="mx-auto max-w-md px-4 py-10">
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-base text-slate-700">
            Este enlace no está activo. Pídele a {brandName} el enlace nuevo de la guía.
          </p>
        </main>
      </div>
    );
  }

  const client = shipment.dispatch.order.client;
  const closed = isFinalShipmentStatus(shipment.status);
  const inLastMile = shipment.status === "OUT_FOR_DELIVERY";
  const address = inLastMile
    ? shipment.dispatch.shippingAddress?.trim() ||
      [client?.address, client?.neighborhood, client?.city].filter(Boolean).join(", ")
    : "";
  const call = closed ? null : telHref(client?.phone);
  const amount = Number(shipment.amountToCollect);
  const amountLabel = shipment.collectOnDelivery && amount > 0 ? formatMoney(amount, currency) : null;
  const destination = toOption(shipment.destinationCity);
  const current = toOption(shipment.currentCity);
  const suggestions = [current, destination].filter((city): city is CityOption => Boolean(city));

  return (
    <div className="min-h-screen bg-slate-50">
      {header}
      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{shipment.code}</h1>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {SHIPMENT_STATUS_LABEL[shipment.status]}
            </span>
          </div>
          <p className="text-base text-slate-700">
            Para <span className="font-semibold text-slate-900">{firstName(client?.name) || "el cliente"}</span>
            {destination ? (
              <>
                {" "}
                en <span className="font-semibold text-slate-900">{destination.name}</span> ({destination.departmentName})
              </>
            ) : null}
          </p>
          {current ? <p className="text-sm text-slate-500">Último reporte: {current.name}</p> : null}
          {amountLabel && !closed ? (
            <p className="rounded-xl bg-amber-50 p-3 text-base font-semibold text-amber-900">
              Cobrar al entregar: {amountLabel}
            </p>
          ) : null}
          {inLastMile ? (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> Dirección de entrega
              </p>
              <p className="mt-1 text-base font-medium text-slate-900">{address || "Pídela a Magilus"}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">La dirección aparece cuando marques &quot;En reparto&quot;.</p>
          )}
          {call ? <CallButton href={call} /> : null}
        </section>

        <CarrierPanel
          token={token}
          status={shipment.status}
          isClosed={closed}
          suggestions={suggestions}
          amountToCollectLabel={amountLabel}
        />

        {shipment.events.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Últimos reportes</p>
            <ul className="space-y-2">
              {shipment.events.map((event) => (
                <li key={event.id} className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">
                    {event.kind === "STATUS" && event.status
                      ? SHIPMENT_STATUS_LABEL[event.status]
                      : event.kind === "INCIDENT" && event.incident
                        ? SHIPMENT_INCIDENT_LABEL[event.incident]
                        : event.kind === "ETA_CHANGE"
                          ? "Cambio de fecha"
                          : "Nota"}
                  </span>
                  {event.city ? ` · ${event.city.name}` : ""} ·{" "}
                  {event.occurredAt.toLocaleString("es-CO", {
                    timeZone: "America/Bogota",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
