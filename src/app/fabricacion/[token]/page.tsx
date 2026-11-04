import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { displayCode } from "@/lib/code-display";
import { formatMoney } from "@/lib/currency";
import { colorLabel } from "@/lib/quote-item-meta";
import { destinationCityLabel, supplierPaymentLabel, toManufacturingLine } from "@/lib/manufacturing-orders";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { imageVariantUrl } from "@/lib/image-variants";
import {
  getSystemBrandName,
  getSystemCurrency,
  getSystemStorefrontLogoPath,
  getSystemWhatsAppPhoneDisplay,
} from "@/lib/system-settings";
import { PrintButton } from "./print-button";

// Orden de fabricacion publica para la proveedora. A proposito NO muestra
// precio de venta, margen ni datos personales del cliente (nombre, telefono,
// direccion, barrio); del cliente solo la ciudad y el departamento de destino.

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  return {
    title: `Orden de fabricación | ${brandName}`,
    robots: { index: false, follow: false },
  };
}

function formatCalendarDate(value: Date | null): string {
  if (!value) return "Por confirmar";
  return value.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function ManufacturingOrderPublicPage({ params }: PageProps) {
  const { token } = await params;
  if (!token) notFound();

  const manufacturingOrder = await prisma.manufacturingOrder.findUnique({
    where: { shareToken: token },
    include: {
      supplier: { select: { name: true, displayName: true } },
      // Del cliente solo ciudad y departamento de destino; nunca dirección, barrio, nombre ni teléfono (29-oct-2026).
      // De la venta solo la forma de pago, para decirle cómo se le paga (30-oct-2026).
      order: {
        select: {
          code: true,
          client: { select: { city: true, department: true } },
          sale: { select: { paymentMethod: true } },
        },
      },
    },
  });
  if (!manufacturingOrder) notFound();

  const [items, brandName, currency, logoPath, whatsAppPhone] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        orderId: manufacturingOrder.orderId,
        confirmedSupplierId: manufacturingOrder.supplierId,
        fulfillmentMode: { not: "STOCK" },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        quantity: true,
        purchaseCost: true,
        notes: true,
        product: { select: { name: true, code: true, thumbnailUrl: true, description: true } },
      },
    }),
    getSystemBrandName(),
    getSystemCurrency(),
    getSystemStorefrontLogoPath(),
    getSystemWhatsAppPhoneDisplay(),
  ]);

  const lines = items.map(toManufacturingLine);
  const totalCost = lines.reduce((sum, line) => sum + (line.subtotal ?? 0), 0);
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const supplierName = manufacturingOrder.supplier.displayName || manufacturingOrder.supplier.name;

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 md:px-6">
          <Image
            src={getPublicAssetUrl(logoPath)}
            alt={brandName}
            width={140}
            height={48}
            className="h-9 w-auto object-contain"
            unoptimized
          />
          <div className="ml-auto flex items-center gap-2">
            <PrintButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 md:px-6 md:py-8">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{displayCode(manufacturingOrder.code)}</h1>
            <p className="text-sm text-slate-600">
              Para <span className="font-semibold text-slate-900">{supplierName}</span> · Pedido{" "}
              {displayCode(manufacturingOrder.order.code)}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Emitida el {formatCalendarDate(manufacturingOrder.createdAt)}
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" /> Fecha de entrega
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {formatCalendarDate(manufacturingOrder.deliveryDate)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> Ciudad de destino
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {destinationCityLabel(manufacturingOrder.order.client) ?? "Por confirmar"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total a pagar a la proveedora</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(totalCost, currency)}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {supplierPaymentLabel(manufacturingOrder.order.sale?.paymentMethod)}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Productos a fabricar</h2>
            <p className="text-xs text-slate-500">
              {lines.length} producto{lines.length === 1 ? "" : "s"} · {totalUnits} unidad
              {totalUnits === 1 ? "" : "es"}
            </p>
          </div>

          {lines.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Esta orden no tiene productos asignados.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lines.map((line) => (
                <li key={line.id} className="flex flex-col gap-3 px-4 py-4">
                  {line.imageUrl ? (
                    // Foto a todo el ancho de la tarjeta, arriba del nombre, con la etiqueta de que es solo
                    // referencia y en qué color se fabrica (26-oct-2026).
                    <div className="space-y-2">
                      <p className="rounded-lg bg-amber-100 px-3 py-2 text-center text-sm font-bold text-amber-900 ring-1 ring-amber-300">
                        {line.imagenColores
                          ? "Vista de referencia con los colores a fabricar"
                          : line.color
                          ? `Foto de referencia, fabricar en color ${colorLabel({
                              color: line.color.toUpperCase(),
                              colorCodigo: line.colorCodigo,
                              colorMaterial: line.colorMaterial,
                            })}`
                          : "Foto de referencia"}
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          line.imagenColores
                            ? getPublicAssetUrl(line.imageUrl)
                            : imageVariantUrl(getPublicAssetUrl(line.imageUrl), "large")
                        }
                        alt={line.imagenColores ? `${line.productName} con los colores a fabricar` : line.productName}
                        className="h-auto w-full rounded-lg border border-slate-100 object-contain"
                      />
                    </div>
                  ) : null}
                  {line.partesTexto.length > 0 ? (
                    // Color por parte, una debajo de otra.
                    <ul className="space-y-1">
                      {line.partesTexto.map((texto) => (
                        <li key={texto} className="rounded-md bg-amber-100 px-2 py-1 text-lg font-bold text-amber-900">
                          {texto.toUpperCase()}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {line.productName}
                        {line.productCode ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">{line.productCode}</span>
                        ) : null}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">Cantidad: {line.quantity}</p>
                    </div>
                    {line.color && line.partesTexto.length === 0 ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {line.colorFotoUrl ? (
                          // Muestra del color de la carta del CRM (la foto vive en el CRM).
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={line.colorFotoUrl}
                            alt={`Muestra del color ${line.color}`}
                            className="h-16 w-16 shrink-0 rounded-md border border-slate-200 object-cover"
                          />
                        ) : null}
                        <p className="inline-block rounded-md bg-amber-100 px-2 py-1 text-lg font-bold text-amber-900">
                          Color:{" "}
                          {colorLabel({
                            color: line.color.toUpperCase(),
                            colorCodigo: line.colorCodigo,
                            colorMaterial: line.colorMaterial,
                          })}
                        </p>
                      </div>
                    ) : null}
                    {line.details ? (
                      <p className="whitespace-pre-line text-sm font-semibold text-slate-900">
                        Medidas / especificaciones: {line.details}
                      </p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      Costo unitario:{" "}
                      {line.unitCost == null ? "Por confirmar" : formatMoney(line.unitCost, currency)}
                      {line.subtotal == null ? null : (
                        <>
                          {" "}
                          · Subtotal:{" "}
                          <span className="font-semibold text-slate-900">{formatMoney(line.subtotal, currency)}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {manufacturingOrder.notes ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{manufacturingOrder.notes}</p>
          </section>
        ) : null}

        <p className="text-center text-xs text-slate-400">
          {brandName} · Dudas sobre esta orden: {whatsAppPhone}
        </p>
      </main>
    </div>
  );
}
