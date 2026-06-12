import { notFound } from "next/navigation";
import {
  BadgeDollarSign,
  FileDown,
  FileText,
  MapPin,
  ReceiptText,
  User,
} from "lucide-react";
import { DownloadSaleInvoicePdfButton } from "@/components/sales/download-sale-invoice-pdf-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/currency";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pdf?: string }>;
};

function statusLabel(status: string, paymentProgress: number): string {
  if (status === "CANCELLED") {
    return "Cancelada";
  }
  if (status === "COMPLETED" && paymentProgress === 100) {
    return "Completada";
  }
  if (paymentProgress < 100) {
    return "Pendiente saldo";
  }
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "ACTIVE":
      return "Activa";
    case "INVOICED":
      return "Facturada";
    default:
      return status;
  }
}

function statusBadgeClassName(status: string, paymentProgress: number): string {
  if (status === "CANCELLED") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (status === "COMPLETED" && paymentProgress === 100) {
    return "border-[#16A34A]/30 bg-[#16A34A]/15 text-[#16A34A]"; // Success green
  }
  if (paymentProgress < 100) {
    return "border-[#CA8A04]/30 bg-[#CA8A04]/15 text-[#CA8A04]"; // Pending yellow
  }
  switch (status) {
    case "DRAFT":
      return "border-border bg-muted text-muted-foreground";
    case "ACTIVE":
      return "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "INVOICED":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export default async function SalePublicPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { pdf } = await searchParams;
  const isPdf = pdf === "true";

  const [sale, currency] = await Promise.all([
    prisma.sale.findUnique({
      where: { invoiceToken: token },
      include: {
        client: true,
        quote: {
          include: {
            items: {
              include: {
                product: true,
                supplier: true,
              },
            },
          },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!sale) {
    notFound();
  }

  const receiptUrl = getPublicAssetUrl(sale.paymentReceiptUrl);
  const receiptIsImage = sale.paymentReceiptType?.startsWith("image/");
  const issuedDate = sale.createdAt.toLocaleDateString("es-CO", { dateStyle: "long" });
  const clientName = sale.client.name || sale.client.email;
  const clientDocument = sale.client.document || "";
  const clientCity = sale.client.city || "";
  const deliveryAddress = sale.client.address || "";
  const capital = Number(sale.total);
  const downPayment = Number(sale.downPaymentAmount);
  const remainingBalance = Math.max(capital - downPayment, 0);
  const paymentProgress = capital > 0 ? Math.min((downPayment / capital) * 100, 100) : 0;

  return (
    <main className={isPdf ? "flex flex-col gap-4 bg-white p-4 text-[#1A1A2E]" : "mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6"}>
      {isPdf ? (
        <>
          {/* HEADER DE FACTURA */}
          <header className="flex items-center justify-between border-b-2 border-[#5B1FA8] pb-6 mb-2">
            <div className="flex items-center gap-4">
              <img
                src="/magilus-logo.svg"
                alt="Magilus Logo"
                className="h-12 w-auto object-contain"
              />
              <div className="border-l pl-4 border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#5B1FA8] leading-none mb-1">
                  Factura
                </p>
                <h1 className="text-1xl font-black tracking-tight text-[#1A1A2E]">
                  N° {sale.code.split("-")[1]}
                </h1>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Fecha</p>
              <p className="text-sm font-bold text-[#1A1A2E]">{issuedDate}</p>
            </div>
          </header>

          {/* DATOS DEL CLIENTE */}
          <section className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Información del Cliente</h3>
            </div>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="p-3 w-1/2">
                    <p className="text-[9px] uppercase text-slate-400 font-bold leading-none mb-1">Nombre / Razón Social</p>
                    <p className="font-bold text-sm leading-none">{clientName}</p>
                  </td>
                  <td className="p-3 w-1/2">
                    <p className="text-[9px] uppercase text-slate-400 font-bold leading-none mb-1">Identificación</p>
                    <p className="font-medium leading-none">{clientDocument || "N/A"}</p>
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="p-3">
                    <p className="text-[9px] uppercase text-slate-400 font-bold leading-none mb-1">Ubicación</p>
                    <p className="leading-tight">{clientCity || "Ciudad no registrada"}{deliveryAddress && deliveryAddress !== "sin confirmar" ? ` - ${deliveryAddress}` : ""}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-[9px] uppercase text-slate-400 font-bold leading-none mb-1">Referencia Cotización</p>
                    <p className="font-bold text-[#5B1FA8] leading-none uppercase">{sale.quote.code}</p>
                  </td>
                </tr>
                <tr>
                  <td className="p-3">
                    <p className="text-[9px] uppercase text-slate-400 font-bold leading-none mb-1">Correo Electrónico</p>
                    <p className="leading-none">{sale.client.email}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-[9px] uppercase text-slate-400 font-bold leading-none mb-1">Contacto</p>
                    <p className="leading-none">{sale.client.phone || "N/A"}</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* TABLA DE PRODUCTOS */}
          <section>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 p-2 text-left text-slate-700 font-semibold">Producto</th>
                  <th className="border border-slate-200 p-2 text-left text-slate-700 font-semibold">Cant.</th>
                  <th className="border border-slate-200 p-2 text-left text-slate-700 font-semibold">Precio unitario</th>
                  <th className="border border-slate-200 p-2 text-right text-slate-700 font-semibold">Total línea</th>
                </tr>
              </thead>
              <tbody>
                {sale.quote.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="p-2">
                      <div className="font-medium text-[#1A1A2E]">{item.product.name}</div>
                      <div className="text-[9px] text-slate-500">{item.product.code ?? item.product.slug}</div>
                    </td>
                    <td className="p-2">{item.quantity}</td>
                    <td className="p-2">{formatMoney(Number(item.unitPrice), currency)}</td>
                    <td className="p-2 text-right text-sm font-bold text-[#1A1A2E]">{formatMoney(Number(item.lineTotal), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* TOTALES */}
          <section className="flex justify-end">
            <table className="w-64 border-collapse text-[11px]">
              <tbody>
                {Number(sale.subtotal) !== Number(sale.total) && (
                  <tr>
                    <td className="border border-slate-200 bg-slate-50 p-2 font-semibold text-right">Subtotal</td>
                    <td className="border border-slate-200 p-2 text-right">{formatMoney(Number(sale.subtotal), currency)}</td>
                  </tr>
                )}
                <tr>
                  <td className="p-3 text-right text-slate-500 font-bold uppercase text-[10px]">Total a Pagar</td>
                  <td className="p-3 text-right text-xl font-black text-[#1A1A2E] border-l border-slate-200 bg-slate-50">
                    {formatMoney(Number(sale.total), currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* FOOTER GARANTÍA Y RESPALDO */}
          <footer className="mt-auto pt-8 border-t border-slate-100">
            <div className="rounded-xl bg-[#F4F4F6] p-6 text-center">
              <p className="text-[11px] leading-relaxed text-slate-600 mb-4 italic">
                &quot;Debe enviarnos fotos, videos a la línea <span className="font-bold text-[#1A1A2E]">573046481994</span> para verificar si la falla es por defecto de fabricación y si son realmente nuestros productos.&quot;
              </p>
              <p className="text-[10px] font-black text-[#5B1FA8] uppercase tracking-wider mb-2">
                GRACIAS POR PREFERIRNOS Y ESPERAMOS PODER SER PARTE DE TU PROYECTO CONTANDO SIEMPRE CON NUESTRO RESPALDO Y ASESORIA.
              </p>
              <a href="https://magilus.com/" className="text-xs font-bold text-[#1A1A2E] underline">magilus.com</a>
            </div>
          </footer>
        </>
      ) : (
        <section
          className={
            "overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-sm"
          }
        >
          <div className={"grid gap-6 p-6 md:grid-cols-[1.3fr_0.7fr] md:p-8"}>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={"flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground"}>
                  M
                </div>
                <div>
                  <p className={"text-xs font-semibold uppercase tracking-[0.28em] text-primary"}>
                    Factura
                  </p>
                  <h1 className={"text-1xl font-black tracking-tight text-foreground md:text-2xl"}>
                    N° {sale.code.split("-")[1]}
                  </h1>
                </div>
              </div>
            </div>

            <div className={isPdf ? "flex flex-col items-end gap-2 text-[10px] text-slate-500" : "flex flex-col items-start gap-3 md:items-end"}>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Created at</p>
                <p className="font-semibold text-foreground">{issuedDate}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {!isPdf && (
        <>
          <section className={"grid gap-4 md:grid-cols-2"}>
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-[0.26em] text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  Client
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className={"text-xl font-semibold text-foreground"}>{clientName}</p>
                <p className={"text-sm text-muted-foreground"}>{clientDocument}</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">City</p>
                    <p className="font-medium text-foreground">{clientCity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="font-medium text-foreground">{deliveryAddress}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-[0.26em] text-muted-foreground">
                  <BadgeDollarSign className="h-3.5 w-3.5" />
                  Invoice Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Quote</p>
                    <p className="font-medium text-foreground">{sale.quote.code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Receipt</p>
                    <p className="font-medium text-foreground">{receiptIsImage ? "Image" : "PDF"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Capital</p>
                    <p className="font-medium text-foreground">{formatMoney(capital, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Down payment</p>
                    <p className="font-medium text-foreground">{formatMoney(downPayment, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="font-semibold text-foreground">{formatMoney(remainingBalance, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold text-foreground">{formatMoney(capital, currency)}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Payment progress</span>
                    <span>{paymentProgress.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${paymentProgress}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>


          <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  Invoice lines
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sale.quote.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground">{item.product.name}</p>
                            <p className="text-xs text-muted-foreground">{item.product.code ?? item.product.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatMoney(Number(item.unitPrice), currency)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatMoney(Number(item.lineTotal), currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileDown className="h-4 w-4 text-primary" />
                    Download
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DownloadSaleInvoicePdfButton invoiceToken={sale.invoiceToken} className="w-full" />
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline", className: "w-full" })}
                  >
                    <ReceiptText className="h-4 w-4" />
                    Open receipt
                  </a>
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
