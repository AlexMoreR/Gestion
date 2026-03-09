import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  Download,
  LifeBuoy,
  MessageCircleMore,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function QuotePublicPage({ params }: PageProps) {
  const { token } = await params;

  const [quote, currency] = await Promise.all([
    prisma.quote.findUnique({
      where: { shareToken: token },
      include: {
        client: true,
        items: {
          include: {
            product: true,
            supplier: true,
          },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!quote) {
    notFound();
  }

  const issuedDate = quote.createdAt.toLocaleDateString("es-CO", {
    dateStyle: "long",
  });

  const subtotal = Number(quote.subtotal);
  const total = Number(quote.total);
  const taxes = Math.max(total - subtotal, 0);
  const discount = 0;

  const supportHref = `https://wa.me/573046481994?text=${encodeURIComponent(
    `Hola, necesito ayuda con la cotizacion ${quote.code}.`,
  )}`;
  const companyInfo = {
    name: "Magilus",
    nit: "900.123.456-7",
    cityOrigin: "Cali - Bogota",
    warranty: "1 ano",
  };
  const clientDocument = quote.client.document || "Por confirmar";
  const clientEmail = quote.client.email || "Por confirmar";
  const deliveryAddress = quote.client.address || "Por confirmar";
  const clientCity = quote.client.city || "Por confirmar";

  return (
    <section className="app-page px-0 pb-8 pt-6 md:px-7 md:pb-12 md:pt-8">

      <div className="flex w-full flex-col gap-5 md:gap-6">
        <section className="relative overflow-hidden rounded-[1.4rem] border border-white/55 bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f766e] p-3 shadow-[0_26px_70px_-34px_rgba(15,23,42,0.7)] md:p-4">
          <div className="pointer-events-none absolute -left-12 -top-16 h-56 w-56 rounded-full bg-cyan-200/25 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-emerald-200/20 blur-3xl" />

          <div className="relative grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-2 px-0 py-0">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundImage: "linear-gradient(135deg, var(--primary-strong), var(--primary))" }}
                >
                  IM
                </span>
                <div>
                  <p className="text-xs font-semibold text-white">{companyInfo.name}</p>
                  <p className="text-[11px] text-sky-100/80">NIT {companyInfo.nit}</p>
                </div>
                <span className="ml-1.5 text-xl font-semibold tracking-tight text-white md:text-3xl">
                  Cotización
                </span>
              </div>

              <div className="rounded-2xl border border-white/28 bg-white/14 p-3 backdrop-blur-md">
                <p className="text-[11px] uppercase tracking-[0.1em] text-sky-100/80">Datos cliente</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-white">{quote.client.name || "Por confirmar"}</p>
                <div className="mt-2 space-y-2 text-xs text-sky-100 md:hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-2">
                    <span>NIT / C.C</span>
                    <span className="text-right font-medium text-white">{clientDocument}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-2">
                    <span>Direccion entrega</span>
                    <span className="text-right font-medium text-white">{deliveryAddress}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-2">
                    <span>Ciudad</span>
                    <span className="font-medium text-white">{clientCity}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Departamento</span>
                    <span className="font-medium text-white">{quote.client.department || "Por confirmar"}</span>
                  </div>
                </div>
                <div className="mt-2 hidden md:grid md:grid-cols-4 md:gap-0 md:text-sm">
                  <div className="border-r border-white/15 pr-3">
                    <p className="text-sky-100/80">NIT / C.C</p>
                    <p className="font-medium text-white">{clientDocument}</p>
                  </div>
                  <div className="border-r border-white/15 px-3">
                    <p className="text-sky-100/80">Direccion entrega</p>
                    <p className="font-medium text-white">{deliveryAddress}</p>
                  </div>
                  <div className="border-r border-white/15 px-3">
                    <p className="text-sky-100/80">Ciudad</p>
                    <p className="font-medium text-white">{clientCity}</p>
                  </div>
                  <div className="pl-3">
                    <p className="text-sky-100/80">Departamento</p>
                    <p className="font-medium text-white">{quote.client.department || "Por confirmar"}</p>
                  </div>
                </div>
              </div>

            </div>

            <aside className="rounded-2xl border border-white/28 bg-white/15 p-3 backdrop-blur-md">
              <p className="text-[11px] uppercase tracking-[0.1em] text-sky-100/80">Datos de empresa</p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight text-white">{quote.code}</p>
              <div className="mt-2 space-y-2 text-xs text-sky-100 md:text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-2">
                  <span>Empresa</span>
                  <span className="text-right font-medium text-white">{companyInfo.name}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-2">
                  <span>Emision</span>
                  <span className="font-medium text-white">{issuedDate}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Ciudad de origen</span>
                  <span className="font-medium text-white">{companyInfo.cityOrigin}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-2">
                  <span>Garantia</span>
                  <span className="font-medium text-white">{companyInfo.warranty}</span>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <div className="space-y-2">
          <section className="overflow-hidden rounded-2xl border border-slate-200/85 bg-white/92 shadow-[0_20px_45px_-36px_rgba(15,23,42,0.45)] backdrop-blur-sm">
            <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5 text-center">
              <h2 className="text-sm font-semibold text-slate-900">DATOS DEL PRODUCTO</h2>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {quote.items.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start gap-3">
                    {item.product.thumbnailUrl ? (
                      <img
                        src={item.product.thumbnailUrl}
                        alt={item.product.name}
                        className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[10px] text-slate-500">
                        Sin img
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{item.product.name}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{item.notes || "Implementacion y configuracion segun requerimiento."}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <p className="text-slate-500">CANT</p>
                      <p className="font-semibold text-slate-900">{item.quantity}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <p className="text-slate-500">Precio</p>
                      <p className="font-semibold text-slate-900">{formatMoney(String(item.unitPrice), currency)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <p className="text-slate-500">Subtotal</p>
                      <p className="font-semibold text-slate-900">{formatMoney(String(item.lineTotal), currency)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full border-collapse text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="border-b border-r border-slate-200 px-4 py-3 text-left">Imagen</th>
                    <th className="border-b border-r border-slate-200 px-4 py-3 text-left">Servicio / Producto</th>
                    <th className="border-b border-r border-slate-200 px-4 py-3 text-left">Descripcion</th>
                    <th className="border-b border-r border-slate-200 px-4 py-3 text-left">CANT</th>
                    <th className="border-b border-r border-slate-200 px-4 py-3 text-left">Precio</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => (
                    <tr key={item.id} className="group transition-colors hover:bg-sky-50/45">
                      <td className="border-r border-slate-200 px-4 py-3">
                        {item.product.thumbnailUrl ? (
                          <img
                            src={item.product.thumbnailUrl}
                            alt={item.product.name}
                            className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[10px] text-slate-500">
                            Sin img
                          </div>
                        )}
                      </td>
                      <td className="border-r border-slate-200 px-4 py-3">
                        <p className="font-medium text-slate-900">{item.product.name}</p>
                      </td>
                      <td className="border-r border-slate-200 px-4 py-3 text-slate-600">{item.notes || "Implementacion y configuracion segun requerimiento."}</td>
                      <td className="border-r border-slate-200 px-4 py-3 text-slate-700">{item.quantity}</td>
                      <td className="border-r border-slate-200 px-4 py-3 text-slate-700">{formatMoney(String(item.unitPrice), currency)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatMoney(String(item.lineTotal), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200/85 bg-white/92 shadow-[0_20px_45px_-36px_rgba(15,23,42,0.45)] backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-2 p-3 md:hidden">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Subtotal</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(String(subtotal), currency)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Descuento</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(String(discount), currency)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Valor adicional</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(String(taxes), currency)}</p>
              </div>
              <div className="rounded-xl border border-slate-300 bg-slate-100 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-slate-600">Valor total</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{formatMoney(String(total), currency)}</p>
              </div>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full border-collapse text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="border-b border-r border-slate-200 px-4 py-3 text-left">Subtotal</th>
                    <th className="border-b border-r border-slate-200 px-4 py-3 text-left">Descuento</th>
                    <th className="border-b border-r border-slate-200 px-4 py-3 text-left">Valor adicional</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-r border-slate-200 px-4 py-3 font-medium text-slate-900">{formatMoney(String(subtotal), currency)}</td>
                    <td className="border-r border-slate-200 px-4 py-3 font-medium text-slate-900">{formatMoney(String(discount), currency)}</td>
                    <td className="border-r border-slate-200 px-4 py-3 font-medium text-slate-900">{formatMoney(String(taxes), currency)}</td>
                    <td className="bg-slate-50/60 px-4 py-3 text-sm font-semibold text-slate-900">{formatMoney(String(total), currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <LifeBuoy className="h-5 w-5 text-sky-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Soporte incluido</p>
            <p className="mt-1 text-xs text-slate-600">Acompanamiento de principio a fin en implementacion y dudas.</p>
          </article>
          <article className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Garantia del servicio</p>
            <p className="mt-1 text-xs text-slate-600">Cobertura de calidad y respaldo sobre entregables acordados.</p>
          </article>
          <article className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <Clock3 className="h-5 w-5 text-indigo-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Tiempo de entrega</p>
            <p className="mt-1 text-xs text-slate-600">Cronograma proyectado y seguimiento transparente por etapa.</p>
          </article>
          <article className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <WalletCards className="h-5 w-5 text-amber-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Forma de pago</p>
            <p className="mt-1 text-xs text-slate-600">Pago flexible segun avance y condiciones comerciales.</p>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_20px_45px_-36px_rgba(15,23,42,0.45)] md:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Acciones</h2>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              <BadgeCheck className="h-4 w-4" />
              Aprobar cotizacion
            </button>
            <Link
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              <MessageCircleMore className="h-4 w-4" />
              Solicitar cambios
            </Link>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Descargar PDF
            </button>
            <Link
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-700 transition hover:-translate-y-0.5 hover:bg-sky-100"
            >
              <MessageCircleMore className="h-4 w-4" />
              Contactar asesor
            </Link>
          </div>
        </section>

        <footer className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_20px_45px_-36px_rgba(15,23,42,0.45)] md:p-5">
          <div className="flex flex-col gap-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ backgroundImage: "linear-gradient(135deg, var(--primary-strong), var(--primary))" }}
              >
                IM
              </span>
              <div>
                <p className="font-semibold text-slate-900">Magilus</p>
                <p className="text-xs text-slate-500">Soluciones empresariales y acompanamiento comercial</p>
              </div>
            </div>
            <div className="grid gap-1 text-xs sm:grid-cols-2 sm:gap-x-5">
              <p>Contacto: +57 304 648 1994</p>
              <p>Correo: comercial@innovacionesmagi.com</p>
              <p>WhatsApp: wa.me/573046481994</p>
              <p>Sitio web: innovacionesmagi.com</p>
            </div>
          </div>
        </footer>
      </div>
    </section>
  );
}

