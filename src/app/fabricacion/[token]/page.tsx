import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarDays, Factory, MapPin } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { suggestDeliveryAddress, toManufacturingLine } from "@/lib/manufacturing-orders";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import {
  getSystemBrandName,
  getSystemCurrency,
  getSystemStorefrontLogoPath,
  getSystemWhatsAppPhoneDisplay,
} from "@/lib/system-settings";
import { PrintButton } from "./print-button";

// Orden de fabricacion publica para la proveedora. A proposito NO muestra
// precio de venta, margen ni datos personales del cliente (nombre, telefono).

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
      // Solo datos de direccion del cliente (nunca nombre ni telefono).
      order: {
        select: {
          code: true,
          client: { select: { address: true, neighborhood: true, city: true, department: true } },
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
  const deliveryAddress =
    manufacturingOrder.deliveryAddress || suggestDeliveryAddress(manufacturingOrder.order.client);

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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
              <Factory className="h-3.5 w-3.5" /> Orden de fabricación
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 md:px-6 md:py-8">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Orden de fabricación</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{manufacturingOrder.code}</h1>
            <p className="text-sm text-slate-600">
              Para <span className="font-semibold text-slate-900">{supplierName}</span> · Pedido{" "}
              {manufacturingOrder.order.code}
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
              <MapPin className="h-3.5 w-3.5" /> Dirección de despacho
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {deliveryAddress || "Por confirmar"}
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
                <li key={line.id} className="flex gap-3 px-4 py-4">
                  {line.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getPublicAssetUrl(line.imageUrl)}
                      alt={line.productName}
                      className="h-20 w-20 shrink-0 rounded-lg border border-slate-100 object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {line.productName}
                        {line.productCode ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">{line.productCode}</span>
                        ) : null}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">Cantidad: {line.quantity}</p>
                    </div>
                    {line.comboName ? (
                      <p className="text-xs text-slate-500">Parte del combo: {line.comboName}</p>
                    ) : null}
                    {line.color ? (
                      <p className="text-xs text-slate-700">
                        <span className="font-medium">Color:</span> {line.color}
                      </p>
                    ) : null}
                    {line.details ? (
                      <p className="whitespace-pre-line text-xs text-slate-700">
                        <span className="font-medium">Medidas / especificaciones:</span> {line.details}
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

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total a pagar a la proveedora</p>
            <p className="text-lg font-bold text-slate-900">{formatMoney(totalCost, currency)}</p>
          </div>
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
