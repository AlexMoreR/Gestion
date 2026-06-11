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
  TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    pdf?: string;
  }>;
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

  if (!quote) {
    notFound();
  }

  const issuedDate = quote.createdAt.toLocaleDateString("es-CO", {
    dateStyle: "long",
  });

  // Centralizamos el parseo de items para mayor eficiencia
  const itemsWithMeta = quote.items.map((item) => ({
    ...item,
    meta: parseQuoteItemMeta(item.notes),
  }));

  const subtotal = itemsWithMeta.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
  const additionalCost = itemsWithMeta.reduce((sum, item) => sum + item.meta.additionalCost, 0);
  const discount = itemsWithMeta.reduce((sum, item) => sum + item.meta.discount, 0);
  const total = Number(quote.total);

  const dynamicSupportHref = await buildSystemWhatsAppHref(`Hola, necesito ayuda con la cotización ${quote.code}.`);
  const dynamicApproveHref = await buildSystemWhatsAppHref(`Hola, deseo aprobar la cotización ${quote.code}.`);
  const dynamicChangesHref = await buildSystemWhatsAppHref(`Hola, solicito cambios para la cotización ${quote.code}.`);

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
    <main className="flex flex-col gap-4">
      {/* Header / Hero Section */}
      <Card
        className={
          isPdf
            ? "overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-none"
            : "overflow-hidden border-none bg-linear-to-br from-slate-900 via-blue-900 to-teal-900 text-white shadow-2xl"
        }
      >
        <CardContent
          className={
            isPdf
              ? "p-3"
              : "p-6 md:p-10"
          }
        >
          <div
            className={
              isPdf
                ? "flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold"
                : "flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-2xl font-bold"
            }
          >
            <div className={isPdf ? "space-y-1" : "space-y-4"}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-2xl font-bold">M</div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Magilus</h2>
                  <p className="text-sm text-blue-100/70">NIT {companyInfo.nit}</p>
                </div>
              </div>
              <div className="space-y-1">
                <h1
                  className={
                    isPdf
                      ? "text-2xl font-bold tracking-tight"
                      : "text-3xl md:text-5xl font-extrabold tracking-tighter"
                  }
                >
                  COTIZACIÓN
                </h1>
                <p
                  className={
                    isPdf
                      ? "text-sm text-slate-500"
                      : "text-lg font-medium text-blue-200"
                  }
                >
                  {quote.code}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 print:hidden">
              <Button
                size="lg"
                className="flex-row w-full bg-white text-slate-900 hover:bg-slate-100"
              >
                <Link
                  href={dynamicApproveHref}
                  target="_blank"
                  className="flex w-full items-center justify-center"
                >
                  <BadgeCheck className="mr-2 h-5 w-5" />
                  Aprobar
                </Link>
              </Button>

              <Button
                size="lg"
                className="flex-row w-full border-white/30 bg-white/10 text-white hover:bg-white/20"
              >
                <Link
                  href={dynamicChangesHref}
                  target="_blank"
                  className="flex w-full items-center justify-center"
                >
                  <MessageCircleMore className="mr-2 h-5 w-5" />
                  Cambios
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Grid */}
      {isPdf ? (
        <Card className="border-slate-300 shadow-none">
          <CardContent className="p-0">
            <table className="w-full text-[10px]">
              <tbody>
                <tr>
                  <td className="border p-2 font-semibold">Cliente</td>
                  <td className="border p-2">{quote.client.name}</td>
                  <td className="border p-2 font-semibold">Fecha</td>
                  <td className="border p-2">{issuedDate}</td>
                </tr>

                <tr>
                  <td className="border p-2 font-semibold">Documento</td>
                  <td className="border p-2">{clientDocument}</td>
                  <td className="border p-2 font-semibold">Garantía</td>
                  <td className="border p-2">{companyInfo.warranty}</td>
                </tr>

                <tr>
                  <td className="border p-2 font-semibold">Ciudad</td>
                  <td className="border p-2">{clientCity}</td>
                  <td className="border p-2 font-semibold">Vigencia</td>
                  <td className="border p-2">15 días</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className={`border-slate-200/60 ${isPdf ? "space-y-1 p-3" : "space-y-3"}`}>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm text-slate-500 uppercase tracking-widest"><User className="h-4 w-4" /> Información del Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><p className="text-xl font-bold text-slate-900">{quote.client.name || "Por confirmar"}</p><p className="text-sm font-medium text-slate-500">{clientDocument}</p></div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-slate-400">Ciudad</p><p className="font-semibold">{clientCity}</p></div>
                <div><p className="text-slate-400">Dirección</p><p className="font-semibold truncate">{deliveryAddress}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card className={`border-slate-200/60 ${isPdf ? "space-y-1 p-3" : "space-y-3"}`}>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm text-slate-500 uppercase tracking-widest"><Building2 className="h-4 w-4" /> Detalles de la Empresa</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-slate-400 flex items-center gap-1"><Calendar className="h-3" /> Emisión</p><p className="font-semibold">{issuedDate}</p></div>
              <div><p className="text-slate-400 flex items-center gap-1"><MapPin className="h-3" /> Origen</p><p className="font-semibold">{companyInfo.cityOrigin}</p></div>
              <div><p className="text-slate-400 flex items-center gap-1"><ShieldCheck className="h-3" /> Garantía</p><p className="font-semibold">{companyInfo.warranty}</p></div>
              <div><Badge variant="secondary" className="mt-1">Válida por 15 días</Badge></div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Items Table */}
      <Card
        className={
          isPdf
            ? "border-slate-300 shadow-none overflow-hidden"
            : "border-slate-200/60 shadow-lg overflow-hidden"
        }
      >
        <CardHeader className="bg-slate-50/50 border-b"><CardTitle className="text-center text-sm font-bold text-slate-700">DESGLOSE DE PRODUCTOS</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className={isPdf ? "text-[10px]" : ""}>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="w[80px]">ITEM</TableHead>
                  <TableHead>PRODUCTO</TableHead>
                  <TableHead className="hidden md:table-cell print:table-cell">DESCRIPCIÓN</TableHead>
                  <TableHead className="text-center">CANT</TableHead>
                  <TableHead className="text-right">UNITARIO</TableHead>
                  <TableHead className="text-right">TOTAL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsWithMeta.map((item, idx) => (
                  <TableRow key={item.id} className="group transition-colors">
                    <TableCell className="font-medium text-slate-400">{String(idx + 1).padStart(2, '0')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {!isPdf && item.product.thumbnailUrl && (
                          <img
                            src={getPublicAssetUrl(item.product.thumbnailUrl)}
                            alt={item.product.name}
                            className="h-10 w-10 rounded-md object-cover border"
                          />
                        )}
                        <p className="font-semibold text-slate-900">{item.product.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell print:table-cell text-slate-500 max-w[200px] truncate">
                      {isPdf
                        ? (item.meta.description || "Ninguna observación").slice(0, 60)
                        : item.meta.description || "Ninguna observación"}
                    </TableCell>
                    <TableCell className="text-center font-bold text-slate-700">{item.quantity}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatMoney(String(item.unitPrice), currency)}</TableCell>
                    <TableCell className="text-right font-bold text-slate-900 whitespace-nowrap">{formatMoney(String(item.lineTotal), currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Totals Section */}
      <div
        className={
          isPdf
            ? "flex gap-3"
            : "flex flex-col md:flex-row gap-6"
        }
      >
        <div className="flex-1">
          <Card className="h-full border-slate-200/60 bg-slate-50/30">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500 uppercase tracking-tighter">Observaciones generales</CardTitle></CardHeader>
            <CardContent
              className={
                isPdf
                  ? "text-[10px] leading-tight italic p-2"
                  : "text-sm text-slate-600 leading-relaxed italic"
              }
            >
              "Esta cotización refleja los requerimientos técnicos discutidos. Los precios están sujetos a cambios según disponibilidad de inventario."
            </CardContent>
          </Card>
        </div>
        <div className="w-full md:w-80 space-y-2">
          <div className="flex justify-between p-2 text-sm"><span>Subtotal</span><span className="font-medium">{formatMoney(String(subtotal), currency)}</span></div>
          {discount > 0 && <div className="flex justify-between p-2 text-sm text-emerald-600"><span>Descuento</span><span>-{formatMoney(String(discount), currency)}</span></div>}
          {additionalCost > 0 && <div className="flex justify-between p-2 text-sm"><span>Cargos adicionales</span><span>{formatMoney(String(additionalCost), currency)}</span></div>}
          <div
            className={
              isPdf
                ? "flex justify-between border border-slate-300 bg-slate-100 p-3 font-bold"
                : "flex justify-between rounded-xl bg-slate-900 p-4 text-white shadow-xl"
            }
          >
            <span className="text-lg font-bold">Total Final</span>
            <span className="text-xl font-black">{formatMoney(String(total), currency)}</span>
          </div>
        </div>
      </div>

      {/* Policies Section */}
      {isPdf ? (
        <Card className="border-slate-300 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">
              Condiciones Comerciales
            </CardTitle>
          </CardHeader>

          <CardContent className="text-[10px] leading-relaxed space-y-1">
            <p>• Vigencia de la oferta: 15 días.</p>
            <p>• Garantía: 1 año.</p>
            <p>• Revisar mercancía al recibirla.</p>
            <p>• Reportar novedades dentro de los primeros 15 minutos.</p>
            <p>
              • Para garantías comunicarse al WhatsApp:
              {" "}
              {whatsAppPhoneDisplay}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-white/50 border-slate-100"><CardContent className="p-4 space-y-2"><Truck className="h-6 w-6 text-primary" /><h3 className="font-bold text-slate-900">Despacho</h3><p className="text-xs text-slate-500 leading-relaxed">El producto se despacha por medio de una empresa aliada en el campo del transporte. Los plazos de entrega pueden variar por razones ajenas como, por ejemplo: cierre de vías por derrumbes o desastres naturales, fallas mecánicas en los vehículos encargados del traslado, o que el cliente haya suministrado los datos erróneamente.</p></CardContent></Card>
          <Card className="bg-white/50 border-slate-100"><CardContent className="p-4 space-y-2"><ShieldCheck className="h-6 w-6 text-emerald-600" /><h3 className="font-bold text-slate-900">Garantías por Manipulación</h3><p className="text-xs text-slate-500 leading-relaxed">Una vez le estén haciendo entrega de su pedido, debe ser revisado en presencia del auxiliar para verificar su estado o notificar inmediatamente cualquier novedad a nuestra línea <Link href={dynamicSupportHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--primary)] underline underline-offset-2">{whatsAppPhoneDisplay}</Link> vía WhatsApp para allí indicarle el paso a seguir, ya que una vez firmada la guía perdería la garantía de nuestra parte y pasaría a hacerle el reclamo directamente a la empresa encargada del transporte. Usted, como cliente, tiene 15 minutos para la verificación de su pedido.</p></CardContent></Card>
          <Card className="bg-white/50 border-slate-100"><CardContent className="p-4 space-y-2"><Wrench className="h-6 w-6 text-amber-600" /><h3 className="font-bold text-slate-900">Garantías por Defectos de Fabricación</h3><p className="text-xs text-slate-500 leading-relaxed">Debe enviarnos fotos y videos a la línea <Link href={dynamicSupportHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--primary)] underline underline-offset-2">{whatsAppPhoneDisplay}</Link> para verificar si la falla es por defecto de fabricación y si son realmente nuestros productos.</p></CardContent></Card>
        </>
      )}

      {/* Feature Grid Section */}
      {!isPdf && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <LifeBuoy className="h-5 w-5 text-sky-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Soporte incluido</p>
            <p className="mt-1 text-xs text-slate-600">Acompañamiento de principio a fin en implementación y dudas.</p>
          </Card>
          <Card className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Garantía del servicio</p>
            <p className="mt-1 text-xs text-slate-600">Cobertura de calidad y respaldo sobre entregables acordados.</p>
          </Card>
          <Card className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <Clock3 className="h-5 w-5 text-indigo-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Tiempo de entrega</p>
            <p className="mt-1 text-xs text-slate-600">Cronograma proyectado y seguimiento transparente por etapa.</p>
          </Card>
          <Card className="rounded-2xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.45)]">
            <CreditCard className="h-5 w-5 text-amber-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">Forma de pago</p>
            <p className="mt-1 text-xs text-slate-600">Pago flexible según avance y condiciones comerciales.</p>
          </Card>
        </div>
      )}

      {/* Action Footer */}
      <div className="sticky bottom-6 flex flex-col items-center gap-4 print:hidden">
        <Card className="w-full max-w-2xl border-none bg-white/80 backdrop-blur-md shadow-2xl p-2 rounded-2xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button className="rounded-xl h-12 font-bold bg-slate-900 hover:bg-slate-800">
              <Link
                href={dynamicApproveHref}
                target="_blank"
                className="flex h-full w-full items-center justify-center"
              >
                <BadgeCheck className="mr-2 h-5 w-5" />
                Aprobar
              </Link>
            </Button>

            <Button variant="outline" className="rounded-xl h-12 font-bold border-slate-200">
              <Link
                href={dynamicChangesHref}
                target="_blank"
                className="flex h-full w-full items-center justify-center"
              >
                <MessageCircleMore className="mr-2 h-5 w-5" />
                Cambios
              </Link>
            </Button>
            <DownloadQuotePdfButton
              quoteToken={token}
              className="rounded-xl h-12 font-bold border-slate-200 flex items-center justify-center" />

            <Button
              variant="secondary"
              className="rounded-xl h-12 font-bold bg-sky-100 text-sky-700 hover:bg-sky-200 border-none"
            >
              <Link
                href={dynamicSupportHref}
                target="_blank"
                className="flex h-full w-full items-center justify-center"
              >
                <LifeBuoy className="mr-2 h-5 w-5" />
                Asesor
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      {/* Brand Footer */}
      {isPdf ? (
        <footer className="border-t pt-2 text-center text-[8px] text-slate-500">
          Magilus · {whatsAppPhoneDisplay} · comercial@innovacionesmagi.com · innovacionesmagi.com
        </footer>
      ) : (
        <footer
          className={
            isPdf
              ? "pt-3 text-center text-[9px]"
              : "pt-8 text-center space-y-4"
          }
        >
          <div className="flex items-center justify-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-xs">M</div>
            <span className="font-bold tracking-tight text-slate-900">Magilus</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] text-slate-400 font-medium uppercase tracking-widest">
            <span>Contacto: {whatsAppPhoneDisplay}</span>
            <span>Correo: comercial@innovacionesmagi.com</span>
            <span>WhatsApp: wa.me/{whatsAppPhoneHref}</span>
            <span>Web: innovacionesmagi.com</span>
          </div>
        </footer>
      )}
    </main>
  );
}
