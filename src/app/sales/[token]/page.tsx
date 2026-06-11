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

function statusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "ACTIVE":
      return "Active";
    case "INVOICED":
      return "Invoiced";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

function statusBadgeClassName(status: string): string {
  switch (status) {
    case "DRAFT":
      return "border-border bg-muted text-muted-foreground";
    case "ACTIVE":
      return "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "INVOICED":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "COMPLETED":
      return "border-primary/30 bg-primary/15 text-primary";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
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
  const receiptIsImage = sale.paymentReceiptType.startsWith("image/");
  const issuedDate = sale.createdAt.toLocaleDateString("es-CO", { dateStyle: "long" });
  const clientName = sale.client.name || sale.client.email;
  const clientDocument = sale.client.document || "Pending";
  const clientCity = sale.client.city || "Pending";
  const deliveryAddress = sale.client.address || "Pending";
  const capital = Number(sale.total);
  const downPayment = Number(sale.downPaymentAmount);
  const remainingBalance = Math.max(capital - downPayment, 0);
  const paymentProgress = capital > 0 ? Math.min((downPayment / capital) * 100, 100) : 0;

  return (
    <main className={isPdf ? "flex flex-col gap-4 bg-white p-4 text-slate-900" : "mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6"}>
      <section
        className={
          isPdf
            ? "flex items-start justify-between rounded-xl border border-slate-300 p-4"
            : "overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-sm"
        }
      >
        <div className={isPdf ? "flex w-full items-start justify-between gap-4" : "grid gap-6 p-6 md:grid-cols-[1.3fr_0.7fr] md:p-8"}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={isPdf ? "flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground" : "flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground"}>
                M
              </div>
              <div>
                <p className={isPdf ? "text-xs font-semibold uppercase tracking-[0.28em] text-slate-500" : "text-xs font-semibold uppercase tracking-[0.28em] text-primary"}>
                  Sales invoice
                </p>
                <h1 className={isPdf ? "text-2xl font-black tracking-tight text-slate-900" : "text-3xl font-black tracking-tight text-foreground md:text-5xl"}>
                  {sale.code}
                </h1>
              </div>
            </div>
            <p className={isPdf ? "max-w-2xl text-[11px] text-slate-500" : "max-w-2xl text-sm text-muted-foreground"}>
              Invoice generated from quote {sale.quote.code}. The receipt is attached to the sales record and can be reviewed below.
            </p>
          </div>

          <div className={isPdf ? "flex flex-col items-end gap-2 text-[10px] text-slate-500" : "flex flex-col items-start gap-3 md:items-end"}>
            <Badge className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(sale.status)}`}>
              {statusLabel(sale.status)}
            </Badge>
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Created at</p>
              <p className="font-semibold text-foreground">{issuedDate}</p>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Invoice token</p>
              <p className="font-mono text-xs text-foreground break-all">{sale.invoiceToken}</p>
            </div>
          </div>
        </div>
      </section>

      <section className={isPdf ? "grid grid-cols-2 gap-3" : "grid gap-4 md:grid-cols-2"}>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-[0.26em] text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className={isPdf ? "text-sm font-semibold text-slate-900" : "text-xl font-semibold text-foreground"}>{clientName}</p>
            <p className={isPdf ? "text-[11px] text-slate-500" : "text-sm text-muted-foreground"}>{clientDocument}</p>
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

      {!isPdf ? (
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

            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-primary" />
                  Receipt preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {receiptIsImage ? (
                  <div className="overflow-hidden rounded-2xl border border-border bg-muted/30">
                    <img
                      src={receiptUrl}
                      alt={`Payment receipt ${sale.code}`}
                      className="h-auto w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                    The receipt is a PDF file. Use the button above to open it or download the invoice PDF.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              <tr>
                <td className="w-1/4 border border-slate-200 bg-slate-50 p-2 font-semibold">Client</td>
                <td className="w-1/4 border border-slate-200 p-2">{clientName}</td>
                <td className="w-1/4 border border-slate-200 bg-slate-50 p-2 font-semibold">Created at</td>
                <td className="w-1/4 border border-slate-200 p-2">{issuedDate}</td>
              </tr>
              <tr>
                <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Quote</td>
                <td className="border border-slate-200 p-2">{sale.quote.code}</td>
                <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Receipt</td>
                <td className="border border-slate-200 p-2">{receiptIsImage ? "Image" : "PDF"}</td>
              </tr>
              <tr>
                <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">City</td>
                <td className="border border-slate-200 p-2">{clientCity}</td>
                <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Address</td>
                <td className="border border-slate-200 p-2">{deliveryAddress}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 p-2 text-left">Product</th>
                <th className="border border-slate-200 p-2 text-left">Qty</th>
                <th className="border border-slate-200 p-2 text-left">Unit</th>
                <th className="border border-slate-200 p-2 text-left">Line total</th>
              </tr>
            </thead>
            <tbody>
              {sale.quote.items.map((item) => (
                <tr key={item.id}>
                  <td className="border border-slate-200 p-2">
                    <div className="font-medium text-slate-900">{item.product.name}</div>
                    <div className="text-[9px] text-slate-500">{item.product.code ?? item.product.slug}</div>
                  </td>
                  <td className="border border-slate-200 p-2">{item.quantity}</td>
                  <td className="border border-slate-200 p-2">{formatMoney(Number(item.unitPrice), currency)}</td>
                  <td className="border border-slate-200 p-2">{formatMoney(Number(item.lineTotal), currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="ml-auto w-64 border-collapse text-[10px]">
            <tbody>
              <tr>
                <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Subtotal</td>
                <td className="border border-slate-200 p-2">{formatMoney(Number(sale.subtotal), currency)}</td>
              </tr>
              <tr>
                <td className="border border-slate-200 bg-slate-50 p-2 font-semibold">Total</td>
                <td className="border border-slate-200 p-2 font-semibold">{formatMoney(Number(sale.total), currency)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
