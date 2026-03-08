import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  Download,
  LifeBuoy,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ token: string }>;
};

function statusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "SENT":
      return "Enviada";
    case "ACCEPTED":
      return "Aceptada";
    case "REJECTED":
      return "Rechazada";
    case "EXPIRED":
      return "Expirada";
    default:
      return status;
  }
}

function statusPillClass(status: string): string {
  switch (status) {
    case "ACCEPTED":
      return "border-emerald-300/70 bg-emerald-100/80 text-emerald-700";
    case "SENT":
      return "border-sky-300/70 bg-sky-100/80 text-sky-700";
    case "REJECTED":
      return "border-red-300/70 bg-red-100/80 text-red-700";
    case "EXPIRED":
      return "border-amber-300/70 bg-amber-100/80 text-amber-700";
    default:
      return "border-slate-300/70 bg-slate-100/80 text-slate-700";
  }
}

export default async function QuotePublicPage({ params }: PageProps) {
  const { token } = await params;

  const [quote, currency] = await Promise.all([
    prisma.quote.findUnique({
      where: { shareToken: token },
      include: {
        client: true,
        createdBy: true,
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
  const validUntilDate = quote.validUntil
    ? quote.validUntil.toLocaleDateString("es-CO", { dateStyle: "long" })
    : "Sin fecha limite";

  const subtotal = Number(quote.subtotal);
  const total = Number(quote.total);
  const taxes = Math.max(total - subtotal, 0);
  const discount = 0;

  const supportHref = `https://wa.me/573046481994?text=${encodeURIComponent(
    `Hola, necesito ayuda con la cotizacion ${quote.code}.`,
  )}`;
  const companyInfo = {
    date: issuedDate,
    company: "Innovaciones Magi",
    contact: "+57 304 648 1994",
    cityOrigin: "Cali - Bogota",
    fabricationAddress: "Sucursal con mejor tiempo",
    warranty: "1 ano",
  };
  const clientFullName = quote.client.name || "Por confirmar";
  const clientDocument = quote.client.document || "Por confirmar";
  const clientEmail = quote.client.email || "Por confirmar";
  const clientPhone = quote.client.phone || "Por confirmar";
  const deliveryAddress = quote.client.address || "Por confirmar";
  const clientCity = quote.client.city || "Por confirmar";
  const clientDepartment = quote.client.department || "Por confirmar";

  return (
    <section className="app-page relative isolate overflow-hidden px-4 pb-8 pt-6 md:px-7 md:pb-12 md:pt-8">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top_right,#dbeafe_0%,#f8fafc_38%,#ffffff_78%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 -z-10 h-64 w-64 rounded-full bg-sky-200/40 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute -right-24 top-8 -z-10 h-72 w-72 rounded-full bg-indigo-200/35 blur-3xl animate-pulse" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-7">
        <section className="relative overflow-hidden rounded-[1.6rem] border border-white/55 bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f766e] p-4 shadow-[0_26px_70px_-34px_rgba(15,23,42,0.7)] md:p-6">
          <div className="pointer-events-none absolute -left-12 -top-16 h-56 w-56 rounded-full bg-cyan-200/25 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-emerald-200/20 blur-3xl" />

          <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-100">
                <Sparkles className="h-3.5 w-3.5" />
                Quotation Viewer
              </span>
              <div className="space-y-1.5">
                <h1 className="text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
                  Tu Cotizacion Esta Lista
                </h1>
                <p className="max-w-2xl text-xs text-sky-100/90 md:text-sm">
                  Revisa cada detalle de tu propuesta, valida costos y decide en minutos con una experiencia clara y premium.
                </p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="cta-float rounded-2xl border border-white/28 bg-white/14 p-2.5 backdrop-blur-md">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-sky-100/80">Precio total</p>
                  <p className="mt-1 text-lg font-semibold text-white md:text-xl">{formatMoney(String(quote.total), currency)}</p>
                </div>
                <div className="cta-float cta-float-delay rounded-2xl border border-white/28 bg-white/14 p-2.5 backdrop-blur-md">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-sky-100/80">Estado</p>
                  <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusPillClass(quote.status)}`}>
                    {statusLabel(quote.status)}
                  </span>
                </div>
                <div className="rounded-2xl border border-white/28 bg-white/14 p-2.5 backdrop-blur-md">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-sky-100/80">Fecha de emision</p>
                  <p className="mt-1 text-xs font-medium text-white md:text-sm">{issuedDate}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-100 md:text-sm"
                >
                  <BadgeCheck className="h-4 w-4" />
                  Aprobar Cotizacion
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/10 px-4 text-xs font-semibold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/20 md:text-sm"
                >
                  <Download className="h-4 w-4" />
                  Descargar PDF
                </button>
              </div>
            </div>

            <aside className="rounded-2xl border border-white/28 bg-white/15 p-3.5 backdrop-blur-md">
              <p className="text-[11px] uppercase tracking-[0.1em] text-sky-100/80">Codigo de cotizacion</p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-white">{quote.code}</p>
              <div className="mt-3 space-y-2.5 text-xs text-sky-100 md:text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-2">
                  <span>Cliente</span>
                  <span className="text-right font-medium text-white">{quote.client.name || quote.client.email}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-2">
                  <span>Emision</span>
                  <span className="font-medium text-white">{issuedDate}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Validez</span>
                  <span className="font-medium text-white">{validUntilDate}</span>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="space-y-3">
          <article className="overflow-hidden rounded-2xl border border-slate-200/85 bg-white/92 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Datos empresa</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="bg-white text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left">Fecha</th>
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left">Empresa</th>
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left">Contacto</th>
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left">Ciudad origen</th>
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left">Direccion de fabricacion</th>
                    <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left">Garantia</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-slate-800">
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{companyInfo.date}</td>
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{companyInfo.company}</td>
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{companyInfo.contact}</td>
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{companyInfo.cityOrigin}</td>
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{companyInfo.fabricationAddress}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{companyInfo.warranty}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200/85 bg-white/92 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Datos del cliente</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="bg-white text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left">Nombre y apellido</th>
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left">NIT / C.C</th>
                    <th className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-2 text-left">Correo electronico</th>
                    <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left">Telefono</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-slate-800">
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{clientFullName}</td>
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{clientDocument}</td>
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{clientEmail}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{clientPhone}</td>
                  </tr>
                </tbody>
                <thead className="bg-white text-[11px] uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap border-y border-r border-slate-200 px-3 py-2 text-left" colSpan={2}>
                      Direccion de entrega
                    </th>
                    <th className="whitespace-nowrap border-y border-r border-slate-200 px-3 py-2 text-left">Ciudad destino</th>
                    <th className="whitespace-nowrap border-y border-slate-200 px-3 py-2 text-left">Departamento</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-slate-800">
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium" colSpan={2}>
                      {deliveryAddress}
                    </td>
                    <td className="whitespace-nowrap border-r border-slate-200 px-3 py-2 font-medium">{clientCity}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{clientDepartment}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="rounded-2xl border border-slate-200/85 bg-white/92 p-5 shadow-[0_20px_45px_-36px_rgba(15,23,42,0.45)] backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Resumen de la cotizacion</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-slate-500">Nombre del cliente</p>
                <p className="font-semibold text-slate-900">{quote.client.name || "Cliente final"}</p>
              </div>
              <div>
                <p className="text-slate-500">Empresa</p>
                <p className="font-semibold text-slate-900">Innovaciones Magi</p>
              </div>
              <div>
                <p className="text-slate-500">Numero de cotizacion</p>
                <p className="font-semibold text-slate-900">{quote.code}</p>
              </div>
              <div>
                <p className="text-slate-500">Fecha</p>
                <p className="font-semibold text-slate-900">{issuedDate}</p>
              </div>
              <div>
                <p className="text-slate-500">Validez de oferta</p>
                <p className="font-semibold text-slate-900">{validUntilDate}</p>
              </div>
              <div>
                <p className="text-slate-500">Responsable de ventas</p>
                <p className="font-semibold text-slate-900">{quote.createdBy.name || quote.createdBy.email}</p>
              </div>
            </div>
            {quote.notes ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-600">
                {quote.notes}
              </div>
            ) : null}
          </article>

          <article className="rounded-2xl border border-slate-200/85 bg-white/92 p-5 shadow-[0_20px_45px_-36px_rgba(15,23,42,0.45)] backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Resumen de costos</p>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-medium text-slate-800">{formatMoney(String(subtotal), currency)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Descuentos</span>
                <span className="font-medium text-slate-800">{formatMoney(String(discount), currency)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Impuestos</span>
                <span className="font-medium text-slate-800">{formatMoney(String(taxes), currency)}</span>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Total final</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                {formatMoney(String(total), currency)}
              </p>
            </div>
            <p className="mt-3 text-xs text-slate-500">El total final incluye costos aplicables y condiciones comerciales vigentes.</p>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/85 bg-white/92 shadow-[0_20px_45px_-36px_rgba(15,23,42,0.45)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/70 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Servicios y productos cotizados</h2>
            <p className="text-xs text-slate-500">{quote.items.length} items</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Servicio / Producto</th>
                  <th className="px-4 py-3 text-left">Descripcion</th>
                  <th className="px-4 py-3 text-left">Cantidad</th>
                  <th className="px-4 py-3 text-left">Precio unitario</th>
                  <th className="px-4 py-3 text-left">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item) => (
                  <tr key={item.id} className="group border-t border-slate-200/80 transition-colors hover:bg-sky-50/45">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.product.name}</p>
                      <p className="text-xs text-slate-500">{item.supplier?.name || "Sin proveedor asignado"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.notes || "Implementacion y configuracion segun requerimiento."}</td>
                    <td className="px-4 py-3 text-slate-700">{item.quantity}</td>
                    <td className="px-4 py-3 text-slate-700">{formatMoney(String(item.unitPrice), currency)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatMoney(String(item.lineTotal), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

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
                <p className="font-semibold text-slate-900">Innovaciones Magi</p>
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