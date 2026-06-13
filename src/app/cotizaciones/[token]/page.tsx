import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Clock3,
  LifeBuoy,
  MessageCircleMore,
  ShieldCheck,
  Truck,
  Wrench,
  WalletCards,
  MapPin,
  Building2,
  FileText,
  Calendar,
  User,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { DownloadQuotePdfButton } from "@/components/quotes/download-quote-pdf-button";
import { formatMoney } from "@/lib/currency";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import {
  buildSystemWhatsAppHref,
  getSystemCurrency,
  getSystemWhatsAppPhoneDisplay,
  getSystemWhatsAppPhoneHref,
} from "@/lib/system-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pdf?: string }>;
};

export default async function QuotePublicPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { pdf } = await searchParams;
  const isPdf = pdf === "true";

  const [quote, currency, whatsAppPhoneDisplay, whatsAppPhoneHref] = await Promise.all([
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
    getSystemWhatsAppPhoneDisplay(),
    getSystemWhatsAppPhoneHref(),
  ]);

  if (!quote) notFound();

  const issuedDate = quote.createdAt.toLocaleDateString("es-CO", { dateStyle: "long" });

  const itemsWithMeta = quote.items.map((item) => ({
    ...item,
    meta: parseQuoteItemMeta(item.notes),
  }));

  const subtotal = itemsWithMeta.reduce(
    (sum, item) => sum + item.quantity * Number(item.unitPrice),
    0
  );
  const additionalCost = itemsWithMeta.reduce((sum, item) => sum + item.meta.additionalCost, 0);
  const discount = itemsWithMeta.reduce((sum, item) => sum + item.meta.discount, 0);
  const total = Number(quote.total);

  const dynamicSupportHref = await buildSystemWhatsAppHref(
    `Hola, necesito ayuda con la cotización ${quote.code}.`
  );
  const dynamicApproveHref = await buildSystemWhatsAppHref(
    `Hola, deseo aprobar la cotización ${quote.code}.`
  );
  const dynamicChangesHref = await buildSystemWhatsAppHref(
    `Hola, solicito cambios para la cotización ${quote.code}.`
  );

  const companyInfo = {
    name: "Magilus",
    nit: "100.61.80.650",
    cityOrigin: "Cali - Bogotá",
    warranty: "1 año",
  };
  const clientDocument = quote.client.document || "Por confirmar";
  const deliveryAddress = quote.client.address || "Por confirmar";
  const clientCity = quote.client.city || "Por confirmar";

  return (
    /**
     * PDF layout: single column, compact, no shadows, no gradients.
     * Web layout: padded container, full visual treatment.
     *
     * Strategy: one JSX tree, differentiated with:
     *   - `isPdf` prop for structural differences (e.g. table vs cards)
     *   - `print:` Tailwind utilities for style differences within the same element
     */
    <main
      className={
        isPdf
          ? "flex flex-col gap-3 p-4 bg-white text-slate-900 text-[13px]"
          : "flex flex-col gap-4 pb-32"
      }
    >
      {/* ─── HEADER ──────────────────────────────────────────────────── */}
      <div
        className={
          isPdf
            ? "flex items-start justify-between border border-slate-300 rounded-lg p-3"
            : "flex flex-row justify-between items-center overflow-hidden rounded-xl border border-slate-200/60 bg-card text-card-foreground shadow-sm p-6 md:p-8"
        }
      >
        {/* Brand + Quote number */}
        <div className="flex flex-row justify-between items-center w-full gap-3">
          <div className="flex items-center gap-3">
            <div
              className={
                isPdf
                  ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white text-base font-black"
                  : "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white text-2xl font-black"
              }
            >
              M
            </div>

            <div>
              <p
                className={
                  isPdf
                    ? "text-base font-bold text-slate-900"
                    : "text-xl font-bold text-slate-900 tracking-tight"
                }
              >
                Magilus
              </p>
              <p className={isPdf ? "text-[11px] text-slate-500" : "text-xs text-slate-500"}>
                NIT {companyInfo.nit}
              </p>
            </div>
          </div>

          <div className={isPdf ? "text-right" : "text-right"}>
            <div className={isPdf ? "flex items-baseline justify-end gap-2" : undefined}>
              <p
                className={
                  isPdf
                    ? "text-base font-bold tracking-widest text-slate-700 uppercase"
                    : "text-sm font-semibold tracking-widest text-slate-400 uppercase"
                }
              >
                Cotización
              </p>
              <h1
                className={
                  isPdf
                    ? "text-base font-bold tracking-tight text-slate-400"
                    : "max-w-full break-all text-2xl font-extrabold leading-none tracking-tighter text-slate-900 sm:break-normal sm:text-3xl md:text-4xl"
                }
              >
                {quote.code}
              </h1>
            </div>
            {isPdf && (
              <p className="text-[11px] font-semibold tracking-wide text-slate-500">
                {companyInfo.cityOrigin}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── CLIENT + COMPANY INFO ───────────────────────────────────── */}
      {isPdf ? (
        /* PDF: compact 2-col table */
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            <tr>
              <td className="border border-slate-200 bg-slate-50 p-2 font-semibold w-1/4">Cliente</td>
              <td className="border border-slate-200 p-2 w-1/4">{quote.client.name}</td>
              <td className="border border-slate-200 bg-slate-50 p-2 font-semibold w-1/4">Fecha emisión</td>
              <td className="border border-slate-200 p-2 w-1/4">{issuedDate}</td>
            </tr>
            <tr>
              <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Documento</td>
              <td className="border border-slate-200 p-2">{clientDocument}</td>
              <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Garantía</td>
              <td className="border border-slate-200 p-2">{companyInfo.warranty}</td>
            </tr>
            <tr>
              <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Ciudad</td>
              <td className="border border-slate-200 p-2">{clientCity}</td>
              <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Vigencia</td>
              <td className="border border-slate-200 p-2">15 días</td>
            </tr>
            <tr>
              <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Dirección</td>
              <td className="border border-slate-200 p-2" colSpan={3}>{deliveryAddress}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        /* Web: two side-by-side cards */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-slate-200/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-widest">
                <User className="h-3.5 w-3.5" /> Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xl font-bold text-slate-900">
                  {quote.client.name || "Por confirmar"}
                </p>
                <p className="text-sm text-slate-500">{clientDocument}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">Ciudad</p>
                  <p className="font-semibold">{clientCity}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Dirección</p>
                  <p className="font-semibold truncate">{deliveryAddress}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-widest">
                <Building2 className="h-3.5 w-3.5" /> Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-400 text-xs flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Emisión
                </p>
                <p className="font-semibold">{issuedDate}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Origen
                </p>
                <p className="font-semibold">{companyInfo.cityOrigin}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Garantía
                </p>
                <p className="font-semibold">{companyInfo.warranty}</p>
              </div>
              <div className="flex items-end">
                <Badge variant="secondary" className="text-xs">Válida 15 días</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── ITEMS TABLE ─────────────────────────────────────────────── */}
      {/* overflow-x-auto solo aplica en web; en PDF la tabla siempre cabe en A4 */}
      <div className={isPdf ? undefined : "overflow-x-auto md:mx-0"}>
            <Table
              className={
                isPdf
                  ? "border-collapse text-[11.5px] [&_td]:border [&_td]:border-[0.5px] [&_td]:border-slate-400 [&_th]:border [&_th]:border-[0.5px] [&_th]:border-slate-400"
                  : "min-w-[760px] border-collapse text-sm [&_td]:border [&_td]:border-black [&_td]:py-1.5 [&_td]:px-2 [&_th]:border [&_th]:border-black"
              }
            >
              <TableHeader>
                <TableRow>
                  <TableHead
                    colSpan={5}
                    className={
                      isPdf
                        ? "py-1.5 px-2 text-center font-bold tracking-widest text-slate-900"
                        : "text-center font-bold tracking-widest text-slate-900"
                    }
                  >
                    Datos de producto
                  </TableHead>
                </TableRow>
                <TableRow className="bg-zinc-200 hover:bg-zinc-200 [&>th]:font-bold [&>th]:normal-case [&>th]:text-zinc-900">
                  <TableHead className={isPdf ? "py-1 px-2 text-center w-10" : "text-center w-16"}>
                    Cant
                  </TableHead>
                  <TableHead className={isPdf ? "py-1 px-2" : ""}>Producto</TableHead>
                  <TableHead className={isPdf ? "py-1 px-2" : ""}>
                    Descripción
                  </TableHead>
                  <TableHead className={isPdf ? "py-1 px-2 text-right" : "text-right"}>
                    Unitario
                  </TableHead>
                  <TableHead className={isPdf ? "py-1 px-2 text-right" : "text-right"}>
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsWithMeta.map((item) => (
                  <TableRow key={item.id} className="transition-colors">
                    <TableCell
                      className={
                        isPdf ? "py-1 px-2 text-center font-bold" : "text-center font-bold text-slate-700"
                      }
                    >
                      {item.quantity}
                    </TableCell>
                    <TableCell className={isPdf ? "py-1 px-2" : ""}>
                      <div className="leading-tight">
                        <p className="font-semibold text-slate-900">
                          {item.product.name}
                        </p>
                        {item.product.code && (
                          <p className={isPdf ? "text-[10px] text-slate-400" : "text-xs text-slate-400"}>
                            {item.product.code}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={
                        isPdf
                          ? "py-1 px-2 text-slate-900 max-w-[160px]"
                          : "text-slate-900 max-w-[240px]"
                      }
                    >
                      <span className={isPdf ? "line-clamp-2" : "line-clamp-2"}>
                        {item.meta.description || "—"}
                      </span>
                    </TableCell>
                    <TableCell
                      className={
                        isPdf
                          ? "py-1 px-2 text-right whitespace-nowrap"
                          : "text-right whitespace-nowrap text-slate-600"
                      }
                    >
                      {formatMoney(String(item.unitPrice), currency)}
                    </TableCell>
                    <TableCell
                      className={
                        isPdf
                          ? "py-1 px-2 text-right font-bold whitespace-nowrap"
                          : "text-right font-bold text-slate-900 whitespace-nowrap"
                      }
                    >
                      {formatMoney(String(item.lineTotal), currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
      </div>

      {/* ─── OBSERVATIONS (table, mismo diseño que productos) ────────── */}
      <div className={isPdf ? undefined : "overflow-x-auto md:mx-0"}>
        <Table
          className={
            isPdf
              ? "border-collapse text-[11.5px] [&_td]:border [&_td]:border-[0.5px] [&_td]:border-slate-400 [&_th]:border [&_th]:border-[0.5px] [&_th]:border-slate-400"
              : "min-w-[760px] border-collapse text-sm [&_td]:border [&_td]:border-black [&_td]:py-1.5 [&_td]:px-2 [&_th]:border [&_th]:border-black"
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead
                colSpan={3}
                className={
                  isPdf
                    ? "py-1.5 px-2 text-center font-bold tracking-widest text-slate-900"
                    : "text-center font-bold tracking-widest text-slate-900"
                }
              >
                Observaciones
              </TableHead>
            </TableRow>
            <TableRow className="bg-zinc-200 hover:bg-zinc-200 [&>th]:font-bold [&>th]:normal-case [&>th]:text-zinc-900">
              <TableHead className={isPdf ? "py-1 px-2 w-12 text-center" : "w-24 text-center"}>
                Imagen
              </TableHead>
              <TableHead className={isPdf ? "py-1 px-2" : ""}>Producto</TableHead>
              <TableHead className={isPdf ? "py-1 px-2" : ""}>Observación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itemsWithMeta.map((item) => (
              <TableRow key={item.id} className="transition-colors">
                <TableCell className={isPdf ? "py-1 px-2 text-center" : "text-center"}>
                  {item.product.thumbnailUrl ? (
                    <img
                      src={getPublicAssetUrl(item.product.thumbnailUrl)}
                      alt={item.product.name}
                      className={
                        isPdf
                          ? "h-8 w-8 rounded object-cover border mx-auto"
                          : "h-12 w-12 rounded object-cover border mx-auto"
                      }
                    />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className={isPdf ? "py-1 px-2" : ""}>
                  <div className="leading-tight">
                    <p className="font-semibold text-slate-900">{item.product.name}</p>
                    {item.product.code && (
                      <p className={isPdf ? "text-[10px] text-slate-400" : "text-xs text-slate-400"}>
                        {item.product.code}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className={isPdf ? "py-1 px-2" : ""}>
                  {item.product.description?.trim() ? (
                    <span className="text-slate-900">{item.product.description}</span>
                  ) : (
                    <span className="italic text-slate-400">(No hay ninguna observación)</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ─── TOTALS ──────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        {/* Totals breakdown */}
        <div className={isPdf ? "w-60 shrink-0 space-y-0.5" : "w-full md:w-72 space-y-1"}>
          <div
            className={
              isPdf
                ? "flex justify-between text-[12px] px-2 py-1"
                : "flex justify-between px-3 py-2 text-sm"
            }
          >
            <span className="text-slate-500">Subtotal</span>
            <span className="font-medium">{formatMoney(String(subtotal), currency)}</span>
          </div>

          {discount > 0 && (
            <div
              className={
                isPdf
                  ? "flex justify-between text-[12px] px-2 py-1 text-emerald-700"
                  : "flex justify-between px-3 py-2 text-sm text-emerald-600"
              }
            >
              <span>Descuento</span>
              <span>−{formatMoney(String(discount), currency)}</span>
            </div>
          )}

          {additionalCost > 0 && (
            <div
              className={
                isPdf
                  ? "flex justify-between text-[12px] px-2 py-1"
                  : "flex justify-between px-3 py-2 text-sm"
              }
            >
              <span className="text-slate-500">Cargos adicionales</span>
              <span className="font-medium">{formatMoney(String(additionalCost), currency)}</span>
            </div>
          )}

          <div
            className={
              isPdf
                ? "flex justify-between border border-slate-300 bg-slate-100 px-3 py-2 font-bold text-[13px]"
                : "flex justify-between rounded-xl bg-slate-900 px-4 py-3 text-white shadow-lg mt-1"
            }
          >
            <span className={isPdf ? "font-bold" : "font-bold text-base"}>Total Final</span>
            <span className={isPdf ? "font-black" : "font-black text-lg"}>
              {formatMoney(String(total), currency)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── POLICIES ────────────────────────────────────────────────── */}
      {isPdf ? (
        /* PDF: compact single card */
        <Card className="border-slate-300 shadow-none">
          <CardHeader className="py-1.5 px-3 pb-1">
            <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Condiciones Comerciales
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 py-1.5 text-[11px] leading-relaxed text-slate-600 space-y-0.5">
            <p>• Vigencia de la oferta: 15 días desde la fecha de emisión.</p>
            <p>• Garantía de {companyInfo.warranty} por defectos de fabricación.</p>
            <p>• Revisar la mercancía en presencia del auxiliar al momento de la entrega.</p>
            <p>• Reportar cualquier novedad dentro de los primeros 15 minutos de recibir el pedido.</p>
            <p>• Garantías y soporte: WhatsApp {whatsAppPhoneDisplay}</p>
          </CardContent>
        </Card>
      ) : (
        /* Web: three policy cards in a row */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-white/50 border-slate-100">
            <CardContent className="p-4 space-y-2">
              <Truck className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-sm text-slate-900">Despacho</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                El producto se despacha por medio de una empresa aliada en transporte. Los plazos
                pueden variar por razones ajenas: cierres de vía, fallas mecánicas o datos
                incorrectos suministrados por el cliente.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/50 border-slate-100">
            <CardContent className="p-4 space-y-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900">Garantías por Manipulación</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Revise el pedido en presencia del auxiliar. Reporte novedades dentro de los primeros
                15 minutos al{" "}
                <Link
                  href={dynamicSupportHref}
                  target="_blank"
                  className="font-semibold text-primary underline underline-offset-2"
                >
                  {whatsAppPhoneDisplay}
                </Link>
                . Firmar la guía sin revisión libera a Magilus de responsabilidad.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/50 border-slate-100">
            <CardContent className="p-4 space-y-2">
              <Wrench className="h-5 w-5 text-amber-600" />
              <h3 className="font-bold text-sm text-slate-900">Defectos de Fabricación</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Envíe fotos y videos al{" "}
                <Link
                  href={dynamicSupportHref}
                  target="_blank"
                  className="font-semibold text-primary underline underline-offset-2"
                >
                  {whatsAppPhoneDisplay}
                </Link>{" "}
                para verificar si aplica garantía. La cobertura es válida solo sobre productos
                originales Magilus.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── FEATURE GRID (web only) ─────────────────────────────────── */}
      {!isPdf && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: <LifeBuoy className="h-5 w-5 text-sky-600" />,
              title: "Soporte incluido",
              desc: "Acompañamiento de principio a fin en implementación y dudas.",
            },
            {
              icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
              title: "Garantía del servicio",
              desc: "Cobertura de calidad y respaldo sobre entregables acordados.",
            },
            {
              icon: <Clock3 className="h-5 w-5 text-indigo-600" />,
              title: "Tiempo de entrega",
              desc: "Cronograma proyectado y seguimiento transparente por etapa.",
            },
            {
              icon: <CreditCard className="h-5 w-5 text-amber-600" />,
              title: "Forma de pago",
              desc: "Pago flexible según avance y condiciones comerciales.",
            },
          ].map(({ icon, title, desc }) => (
            <Card
              key={title}
              className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.4)]"
            >
              {icon}
              <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{desc}</p>
            </Card>
          ))}
        </div>
      )}

      {/* ─── STICKY ACTION FOOTER (web only) ────────────────────────── */}
      {!isPdf && (
        <div className="fixed bottom-4 left-0 right-0 flex justify-center px-4 print:hidden z-50">
          <Card className="w-full max-w-lg border-none bg-white/90 backdrop-blur-md shadow-2xl p-2 rounded-2xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Button
                className="rounded-xl h-11 font-bold bg-slate-900 hover:bg-slate-800 text-xs"
              >
                <Link href={dynamicApproveHref} target="_blank" className="flex items-center justify-center">
                  <BadgeCheck className="mr-1.5 h-4 w-4" />
                  Aprobar
                </Link>
              </Button>
              <Button
                variant="outline"
                className="rounded-xl h-11 font-bold border-slate-200 text-xs"
              >
                <Link href={dynamicChangesHref} target="_blank" className="flex items-center justify-center">
                  <MessageCircleMore className="mr-1.5 h-4 w-4" />
                  Cambios
                </Link>
              </Button>
              <DownloadQuotePdfButton
                quoteToken={token}
                className="rounded-xl h-11 font-bold border-slate-200 text-xs flex items-center justify-center"
              />
              <Button
                variant="secondary"
                className="rounded-xl h-11 font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 border-none text-xs"
              >
                <Link href={dynamicSupportHref} target="_blank" className="flex items-center justify-center">
                  <LifeBuoy className="mr-1.5 h-4 w-4" />
                  Asesor
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── FOOTER ──────────────────────────────────────────────────── */}
      {isPdf ? (
        <footer className="border-t border-slate-200 pt-2 text-center text-[10px] text-slate-400">
          Magilus · {whatsAppPhoneDisplay} · comercial@innovacionesmagi.com · innovacionesmagi.com
        </footer>
      ) : (
        <footer className="pt-6 pb-2 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white font-black text-sm">
              M
            </div>
            <span className="font-bold tracking-tight text-slate-900">Magilus</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-[10px] text-slate-400 font-medium uppercase tracking-widest">
            <span>Tel: {whatsAppPhoneDisplay}</span>
            <span>comercial@innovacionesmagi.com</span>
            <span>innovacionesmagi.com</span>
          </div>
        </footer>
      )}
    </main>
  );
}
