import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, MapPin, PackageCheck } from "lucide-react";
import { markColorNoticeSeenAction, markReadyForDispatchAction } from "@/app/actions/manufacturing-order-actions";
import { colombiaDayKey, colombiaTimeOfDay } from "@/lib/colombia-time";
import { EMBALAJE_MAX_FOTOS } from "@/lib/embalaje-fotos";
import { fechaAviso } from "@/lib/color-change";
import { AVISO_PRODUCTO_CANCELADO, textoAvisoOF } from "@/lib/sale-item-cancel";
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
  searchParams: Promise<{ ok?: string; error?: string }>;
};

// "04/11/2026 a las 14:30", en hora de Colombia.
function fechaHoraColombia(value: Date): string {
  return `${colombiaDayKey(value).split("-").reverse().join("/")} a las ${colombiaTimeOfDay(value)}`;
}

const TIPO_FOTO: Record<string, string> = {
  ABIERTO: "Foto 1: paquete abierto",
  CERRADO: "Foto 2: paquete cerrado",
  EXTRA: "Foto extra",
};

const fileInputClass =
  "block w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-800";

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

export default async function ManufacturingOrderPublicPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { ok, error } = await searchParams;
  if (!token) notFound();

  const manufacturingOrder = await prisma.manufacturingOrder.findUnique({
    where: { shareToken: token },
    include: {
      supplier: { select: { name: true, displayName: true } },
      // Cambios de color que la proveedora aún no marca como vistos (nov-2026).
      avisosColor: {
        where: { vistoEn: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, producto: true, colorViejo: true, colorNuevo: true, createdAt: true },
      },
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
        // Fotos del embalaje aún sin despacho y si ya está despachado (despacho no cancelado ni devuelto).
        embalajeFotos: {
          where: { dispatchId: null, tipo: { not: "LLEGADA" } },
          orderBy: { createdAt: "asc" },
          select: { id: true, tipo: true, url: true, createdAt: true },
        },
        dispatchItems: {
          where: { dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } } },
          select: { id: true },
          take: 1,
        },
      },
    }),
    getSystemBrandName(),
    getSystemCurrency(),
    getSystemStorefrontLogoPath(),
    getSystemWhatsAppPhoneDisplay(),
  ]);

  const lines = items.map(toManufacturingLine);
  const embalajeById = new Map(
    items.map((item) => [item.id, { fotos: item.embalajeFotos, despachado: item.dispatchItems.length > 0 }] as const),
  );
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
        {ok ? (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 print:hidden">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {ok}
          </p>
        ) : null}
        {error ? (
          <p className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 print:hidden">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </p>
        ) : null}
        {manufacturingOrder.avisosColor.map((aviso) => (
          <section
            key={aviso.id}
            className="flex flex-col gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="flex items-start gap-2 text-base font-bold text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                {aviso.colorNuevo === AVISO_PRODUCTO_CANCELADO ? "Aviso del" : "Color cambiado el"} {fechaAviso(aviso.createdAt)}: {textoAvisoOF(aviso)}
              </span>
            </p>
            <form action={markColorNoticeSeenAction} className="print:hidden">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="avisoId" value={aviso.id} />
              <button
                type="submit"
                className="w-full rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 sm:w-auto"
              >
                Ya lo vi
              </button>
            </form>
          </section>
        ))}

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
                        {line.color
                          ? `Foto de referencia, fabricar en color ${colorLabel({
                              color: line.color.toUpperCase(),
                              colorCodigo: line.colorCodigo,
                              colorMaterial: line.colorMaterial,
                            })}`
                          : "Foto de referencia"}
                      </p>
                      {line.imagenReferenciaUrl ? (
                        // Colores a fabricar y referencia subida a mano lado a lado (también al imprimir); en
                        // celular, apiladas.
                        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 print:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-center text-xs font-semibold text-slate-700">Con los colores a fabricar</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={getPublicAssetUrl(line.imageUrl)}
                              alt={`${line.productName} con los colores a fabricar`}
                              className="h-auto w-full rounded-lg border border-slate-100 object-contain"
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-center text-xs font-semibold text-slate-700">Imagen de referencia del producto</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageVariantUrl(getPublicAssetUrl(line.imagenReferenciaUrl), "large")}
                              alt={`${line.productName}: imagen de referencia`}
                              className="h-auto w-full rounded-lg border border-slate-100 object-contain"
                            />
                          </div>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            line.imagenDeColores
                              ? getPublicAssetUrl(line.imageUrl)
                              : imageVariantUrl(getPublicAssetUrl(line.imageUrl), "large")
                          }
                          alt={line.imagenDeColores ? `${line.productName} con los colores a fabricar` : line.productName}
                          className="h-auto w-full rounded-lg border border-slate-100 object-contain"
                        />
                      )}
                      {line.partesTexto ? (
                        <p className="text-center text-sm font-semibold text-slate-900">{line.partesTexto}</p>
                      ) : null}
                    </div>
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
                    {line.color ? (
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
                  {(() => {
                    const embalaje = embalajeById.get(line.id);
                    if (!embalaje || embalaje.despachado) return null;
                    const tieneObligatorias =
                      embalaje.fotos.some((foto) => foto.tipo === "ABIERTO") &&
                      embalaje.fotos.some((foto) => foto.tipo === "CERRADO");
                    const cupoExtra = EMBALAJE_MAX_FOTOS - embalaje.fotos.length;
                    return (
                      <div className="space-y-3 print:hidden">
                        {embalaje.fotos.length > 0 ? (
                          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <p className="text-sm font-semibold text-emerald-900">Fotos del embalaje enviadas</p>
                            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                              {embalaje.fotos.map((foto) => (
                                <li key={foto.id} className="space-y-1">
                                  <a href={getPublicAssetUrl(foto.url)} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={getPublicAssetUrl(foto.url)}
                                      alt={TIPO_FOTO[foto.tipo] ?? "Foto del embalaje"}
                                      className="aspect-square w-full rounded-md border border-emerald-200 object-cover"
                                    />
                                  </a>
                                  <p className="text-xs font-semibold text-slate-800">{TIPO_FOTO[foto.tipo] ?? "Foto"}</p>
                                  <p className="text-xs text-slate-600">Subida el {fechaHoraColombia(foto.createdAt)}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {cupoExtra > 0 ? (
                          <details className="group rounded-lg border border-slate-200">
                            <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                              <PackageCheck className="h-4 w-4" />
                              {tieneObligatorias ? "Agregar más fotos" : "Listo para despacho"}
                            </summary>
                            <form action={markReadyForDispatchAction} className="space-y-3 p-3">
                              <input type="hidden" name="token" value={token} />
                              <input type="hidden" name="orderItemId" value={line.id} />
                              {tieneObligatorias ? null : (
                                <>
                                  <label className="block space-y-1">
                                    <span className="text-sm font-semibold text-slate-900">
                                      Foto 1: producto empacado, paquete abierto
                                    </span>
                                    <input type="file" name="embalajeAbierto" accept="image/*" required className={fileInputClass} />
                                  </label>
                                  <label className="block space-y-1">
                                    <span className="text-sm font-semibold text-slate-900">
                                      Foto 2: paquete cerrado con la guía
                                    </span>
                                    <input type="file" name="embalajeCerrado" accept="image/*" required className={fileInputClass} />
                                  </label>
                                </>
                              )}
                              <label className="block space-y-1">
                                <span className="text-sm font-semibold text-slate-900">
                                  Fotos extra (hasta {Math.min(3, tieneObligatorias ? cupoExtra : cupoExtra - 2)})
                                </span>
                                <input
                                  type="file"
                                  name="embalajeExtra"
                                  accept="image/*"
                                  multiple
                                  required={tieneObligatorias}
                                  className={fileInputClass}
                                />
                              </label>
                              <button
                                type="submit"
                                className="w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"
                              >
                                Enviar fotos
                              </button>
                            </form>
                          </details>
                        ) : null}
                      </div>
                    );
                  })()}
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
