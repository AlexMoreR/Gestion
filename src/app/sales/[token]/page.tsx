import { notFound } from "next/navigation";
import {
  Calendar,
  FileDown,
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
import { formatInvoiceNumber } from "@/lib/document-names";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";

type SaleWithDiscountFields = {
  grossTotal?: unknown;
  discountAmount?: unknown;
  salePayments?: Array<{
    amount?: unknown;
    paymentMethod?: unknown;
    note?: unknown;
    receiptUrl?: unknown;
    receiptName?: unknown;
    receiptType?: unknown;
    createdAt?: unknown;
  }>;
  paymentReceipts?: unknown;
  quote: {
    total: unknown;
  };
};

type SaleReceiptSummary = {
  amount: number;
  paymentMethod: string;
  note: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
  receiptType: string | null;
  paidAt: string | null;
};

function formatReceiptDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toLocaleDateString("es-CO", { dateStyle: "long" });
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString("es-CO", { dateStyle: "long" });
  }
  return null;
}

function parseSaleReceipts(raw: unknown): SaleReceiptSummary[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const candidate = item as Partial<SaleReceiptSummary> & { amount?: unknown };
      const amount = Number(candidate.amount ?? 0);
      const paymentMethod = typeof candidate.paymentMethod === "string" ? candidate.paymentMethod : "";
      const note = typeof candidate.note === "string" && candidate.note.trim() ? candidate.note.trim() : null;
      const receiptUrl = typeof candidate.receiptUrl === "string" && candidate.receiptUrl.trim() ? candidate.receiptUrl.trim() : null;
      const receiptName = typeof candidate.receiptName === "string" && candidate.receiptName.trim() ? candidate.receiptName.trim() : null;
      const receiptType = typeof candidate.receiptType === "string" && candidate.receiptType.trim() ? candidate.receiptType.trim() : null;

      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return {
        amount,
        paymentMethod,
        note,
        receiptUrl,
        receiptName,
        receiptType,
        paidAt: null as string | null,
      };
    })
    .filter((item): item is SaleReceiptSummary => Boolean(item));
}

function extractSaleReceipts(sale: SaleWithDiscountFields): SaleReceiptSummary[] {
  if (Array.isArray(sale.salePayments) && sale.salePayments.length > 0) {
    return sale.salePayments
      .map((item) => {
        const amount = Number(item.amount ?? 0);
        const paymentMethod = typeof item.paymentMethod === "string" ? item.paymentMethod : "";
        const note = typeof item.note === "string" && item.note.trim() ? item.note.trim() : null;
        const receiptUrl = typeof item.receiptUrl === "string" && item.receiptUrl.trim() ? item.receiptUrl.trim() : null;
        const receiptName = typeof item.receiptName === "string" && item.receiptName.trim() ? item.receiptName.trim() : null;
        const receiptType = typeof item.receiptType === "string" && item.receiptType.trim() ? item.receiptType.trim() : null;

        if (!Number.isFinite(amount) || amount <= 0) {
          return null;
        }

        return {
          amount,
          paymentMethod,
          note,
          receiptUrl,
          receiptName,
          receiptType,
          paidAt: formatReceiptDate(item.createdAt),
        };
      })
      .filter((item): item is SaleReceiptSummary => Boolean(item));
  }

  return parseSaleReceipts(sale.paymentReceipts);
}

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
        salePayments: {
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!sale) {
    notFound();
  }

  const receiptUrl = sale.paymentReceiptUrl ? getPublicAssetUrl(sale.paymentReceiptUrl) : "";
  const issuedDate = sale.createdAt.toLocaleDateString("es-CO", { dateStyle: "long" });
  const clientName = sale.client.name || sale.client.email;
  const clientDocument = sale.client.document || "";
  const clientCity = sale.client.city || "";
  const deliveryAddress = sale.client.address || "";
  const itemsWithMeta = sale.quote.items.map((item) => ({
    ...item,
    meta: parseQuoteItemMeta(item.notes),
  }));
  const saleWithDiscount = sale as SaleWithDiscountFields;
  const grossTotal = Number(saleWithDiscount.grossTotal ?? sale.quote.total);
  const discountAmount = Number(saleWithDiscount.discountAmount ?? 0);
  // El total se calcula sumando los productos mostrados para que siempre
  // coincida con la tabla, aunque la cotizacion se haya editado.
  const itemsTotal = itemsWithMeta.reduce((sum, item) => sum + Number(item.lineTotal), 0);
  const capital = itemsTotal;
  const receiptSummary = extractSaleReceipts(saleWithDiscount);
  const downPayment = receiptSummary.length > 0
    ? receiptSummary.reduce((sum, receipt) => sum + receipt.amount, 0)
    : Number(sale.downPaymentAmount);
  const remainingBalance = Math.max(capital - downPayment, 0);
  const paymentProgress = capital > 0 ? Math.min((downPayment / capital) * 100, 100) : 0;
  const hasBalance = downPayment > 0 || remainingBalance > 0;

  const receiptsLedger = receiptSummary.reduce<Array<(typeof receiptSummary)[number] & { pending: number }>>((acc, receipt) => {
    const previousPending = acc.length > 0 ? acc[acc.length - 1].pending : capital;
    const pending = Math.max(previousPending - receipt.amount, 0);
    acc.push({
      ...receipt,
      pending,
    });
    return acc;
  }, []);

  return (
    <main className={isPdf ? "flex flex-col gap-3 p-1 bg-white text-slate-900 text-[13px]" : "mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-6"}>
      {isPdf ? (
        <>
          {/* ─── HEADER ─── */}
          <div className="flex items-start justify-between border border-slate-300 rounded-lg p-3">
            <div className="flex flex-row justify-between items-center w-full gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white text-base font-black">
                  M
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900">Magilus</p>
                  <p className="text-[11px] text-slate-500">NIT 100.61.80.650</p>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-baseline justify-end gap-2">
                  <p className="text-base font-bold tracking-widest text-slate-700 uppercase">Factura</p>
                  <h1 className="text-base font-bold tracking-tight text-slate-400">
                    N° {formatInvoiceNumber(sale.code)}
                  </h1>
                </div>
                <p className="text-[11px] font-semibold tracking-wide text-slate-500">{issuedDate}</p>
              </div>
            </div>
          </div>

          {/* ─── CLIENTE + DESTINO ─── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <User className="h-4 w-4" /> Cliente
              </div>
              <p className="text-xs font-semibold text-slate-900">{clientName}</p>
              <p className="text-xs text-slate-500">CC/NIT: {clientDocument || "Por confirmar"}</p>
              <p className="text-xs text-slate-500">Teléfono: {sale.client.phone || "Por confirmar"}</p>
              <p className="text-xs text-slate-500 break-all">Email: {sale.client.email}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <MapPin className="h-4 w-4" /> Destino
              </div>
              <p className="text-xs text-slate-500">Ciudad: {clientCity || "Por confirmar"}</p>
              <p className="text-xs text-slate-500">Dirección: {deliveryAddress || "Por confirmar"}</p>
              <p className="text-xs text-slate-500">Referencia: {sale.client.neighborhood || "Por confirmar"}</p>
              <p className="text-xs text-slate-500">Cotización ref: {sale.quote.code}</p>
            </div>
          </div>

          {/* ─── DATOS DE PRODUCTO ─── */}
          <h2 className="text-center text-[13px] font-bold uppercase tracking-widest text-slate-900">
            Datos de producto
          </h2>
          <div className="-mt-2">
            <Table className="border-collapse text-[11.5px] [&_td]:border [&_td]:border-[0.5px] [&_td]:border-slate-400 [&_th]:border [&_th]:border-[0.5px] [&_th]:border-slate-400">
              <TableHeader>
                <TableRow className="bg-zinc-200 hover:bg-zinc-200 [&>th]:h-auto [&>th]:py-1 [&>th]:font-bold [&>th]:text-zinc-900">
                  <TableHead className="py-1 px-2 text-center w-10">Cant</TableHead>
                  <TableHead className="py-1 px-2">Producto</TableHead>
                  <TableHead className="py-1 px-2">Descripción</TableHead>
                  <TableHead className="py-1 px-2 text-right">Unitario</TableHead>
                  <TableHead className="py-1 px-2 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsWithMeta.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="py-1 px-2 text-center font-bold">{item.quantity}</TableCell>
                    <TableCell className="py-1 px-2">
                      <div className="leading-tight">
                        <p className="font-semibold text-slate-900">{item.product.name}</p>
                        {item.product.code && (
                          <p className="text-[10px] text-slate-400">{item.product.code}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-1 px-2 text-slate-900 max-w-[160px]">
                      <span className="line-clamp-2">{item.meta.description || "—"}</span>
                    </TableCell>
                    <TableCell className="py-1 px-2 text-right whitespace-nowrap">
                      {formatMoney(Number(item.unitPrice), currency)}
                    </TableCell>
                    <TableCell className="py-1 px-2 text-right font-bold whitespace-nowrap">
                      {formatMoney(Number(item.lineTotal), currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ─── DETALLES DE ABONO ─── */}
          {receiptsLedger.length > 0 ? (
            <>
              <h2 className="text-center text-[13px] font-bold uppercase tracking-widest text-slate-900">
                Detalles de abono
              </h2>
              <div className="-mt-2">
                <Table className="border-collapse text-[11.5px] [&_td]:border [&_td]:border-[0.5px] [&_td]:border-slate-400 [&_th]:border [&_th]:border-[0.5px] [&_th]:border-slate-400">
                  <TableHeader>
                    <TableRow className="bg-zinc-200 hover:bg-zinc-200 [&>th]:h-auto [&>th]:py-1 [&>th]:font-bold [&>th]:text-zinc-900">
                      <TableHead className="py-1 px-2">Fecha</TableHead>
                      <TableHead className="py-1 px-2">Tipo</TableHead>
                      <TableHead className="py-1 px-2 text-right">Abono</TableHead>
                      <TableHead className="py-1 px-2 text-center">Comprobante</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiptsLedger.map((receipt, index) => (
                      <TableRow key={`${receipt.paymentMethod}-${index}`}>
                        <TableCell className="py-1 px-2 whitespace-nowrap">{receipt.paidAt || "—"}</TableCell>
                        <TableCell className="py-1 px-2">{receipt.paymentMethod || "N/A"}</TableCell>
                        <TableCell className="py-1 px-2 text-right font-semibold whitespace-nowrap">
                          {formatMoney(receipt.amount, currency)}
                        </TableCell>
                        <TableCell className="py-1 px-2 text-center">
                          {receipt.receiptUrl && !(receipt.receiptType && receipt.receiptType.includes("pdf")) ? (
                            <img
                              src={getPublicAssetUrl(receipt.receiptUrl)}
                              alt={receipt.receiptName || "Comprobante"}
                              className="mx-auto h-14 w-14 rounded border border-slate-300 object-cover"
                            />
                          ) : receipt.receiptUrl ? (
                            receipt.receiptName || "Comprobante PDF"
                          ) : (
                            "Sin comprobante"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}

          {/* ─── PROGRESO DE PAGO ─── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Progreso de pago</span>
              <span>{paymentProgress.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-primary" style={{ width: `${paymentProgress}%` }} />
            </div>
          </div>

          {/* ─── TOTALES (en fila) ─── */}
          <div className="flex border border-slate-300 text-[12px]">
            <div className="flex-1 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Abono</p>
              <p className="font-semibold text-slate-900">{formatMoney(downPayment, currency)}</p>
            </div>
            <div className="flex-1 border-l border-slate-300 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Saldo pendiente</p>
              <p className="font-semibold text-slate-900">{formatMoney(remainingBalance, currency)}</p>
            </div>
            <div className="flex-1 border-l border-slate-300 bg-zinc-200 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-900">Total</p>
              <p className="font-black text-slate-900">{formatMoney(capital, currency)}</p>
            </div>
          </div>

          {/* ─── BARRA DE AGRADECIMIENTO ─── */}
          <div className="bg-zinc-100 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-900">
              Gracias por preferirnos y esperamos poder ser parte de tu proyecto contando siempre con nuestro respaldo y asesoria
            </p>
          </div>

          {/* ─── FOOTER ─── */}
          <footer className="border-t border-slate-200 pt-2 text-center text-[10px] text-slate-400">
            Magilus · comercial@magilus.com · magilus.com
          </footer>
        </>
      ) : (
        <div className="flex flex-row justify-between items-center overflow-hidden rounded-xl border border-slate-200/60 bg-card text-card-foreground shadow-sm p-4">
          <div className="flex flex-row justify-between items-center w-full gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white text-2xl font-black">
                M
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900 tracking-tight">Magilus</p>
                <p className="text-xs text-slate-500">NIT 100.61.80.650</p>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-baseline justify-end gap-2">
                <p className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
                  Factura
                </p>
                <h1 className="max-w-full break-all text-2xl font-extrabold tracking-tight text-slate-400">
                  N° {formatInvoiceNumber(sale.code)}
                </h1>
              </div>
              <div className="flex items-center justify-end gap-1.5 text-sm font-semibold text-slate-500">
                <Calendar className="h-4 w-4" /> {issuedDate}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isPdf && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <User className="h-4 w-4" /> Cliente
              </div>
              <p className="text-xs font-semibold text-slate-900">{clientName}</p>
              <p className="text-xs text-slate-500">CC/NIT: {clientDocument || "Por confirmar"}</p>
              <p className="text-xs text-slate-500">Teléfono: {sale.client.phone || "Por confirmar"}</p>
              <p className="text-xs text-slate-500 break-all">Email: {sale.client.email}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <MapPin className="h-4 w-4" /> Destino
              </div>
              <p className="text-xs text-slate-500">Ciudad: {clientCity || "Por confirmar"}</p>
              <p className="text-xs text-slate-500">Dirección: {deliveryAddress || "Por confirmar"}</p>
              <p className="text-xs text-slate-500">Referencia: {sale.client.neighborhood || "Por confirmar"}</p>
              <p className="text-xs text-slate-500">Cotización ref: {sale.quote.code}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-center text-base font-bold uppercase tracking-widest text-slate-900">
              Datos de producto
            </h2>
            <div className="overflow-x-auto md:mx-0">
              <Table className="min-w-[760px] border-collapse text-sm [&_td]:border [&_td]:border-black [&_td]:py-1.5 [&_td]:px-2 [&_th]:border [&_th]:border-black">
                <TableHeader>
                  <TableRow className="bg-zinc-200 hover:bg-zinc-200 [&>th]:h-auto [&>th]:py-1 [&>th]:font-bold [&>th]:text-zinc-900">
                    <TableHead className="text-center w-16">Cant</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Unitario</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsWithMeta.map((item) => (
                    <TableRow key={item.id} className="transition-colors">
                      <TableCell className="text-center font-bold text-slate-700">
                        {item.quantity}
                      </TableCell>
                      <TableCell>
                        <div className="leading-tight">
                          <p className="font-semibold text-slate-900">{item.product.name}</p>
                          {item.product.code && (
                            <p className="text-xs text-slate-400">{item.product.code}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-900 max-w-[240px]">
                        <span className="line-clamp-2">{item.meta.description || "—"}</span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap text-slate-600">
                        {formatMoney(Number(item.unitPrice), currency)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatMoney(Number(item.lineTotal), currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-center text-base font-bold uppercase tracking-widest text-slate-900">
              Detalles de abono
            </h2>
            <div className="overflow-x-auto md:mx-0">
              <Table className="min-w-[760px] border-collapse text-sm [&_td]:border [&_td]:border-black [&_td]:py-1.5 [&_td]:px-2 [&_th]:border [&_th]:border-black">
                <TableHeader>
                  <TableRow className="bg-zinc-200 hover:bg-zinc-200 [&>th]:h-auto [&>th]:py-1 [&>th]:font-bold [&>th]:text-zinc-900">
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Abono</TableHead>
                    <TableHead className="text-center">Foto del comprobante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receiptsLedger.length > 0 ? (
                    receiptsLedger.map((receipt, index) => (
                      <TableRow key={`${receipt.paymentMethod}-${index}`} className="transition-colors">
                        <TableCell className="whitespace-nowrap text-slate-900">
                          {receipt.paidAt || "—"}
                        </TableCell>
                        <TableCell className="text-slate-900">
                          {receipt.paymentMethod || "N/A"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap font-semibold text-slate-900">
                          {formatMoney(receipt.amount, currency)}
                        </TableCell>
                        <TableCell className="text-center">
                          {receipt.receiptUrl ? (
                            receipt.receiptType && receipt.receiptType.includes("pdf") ? (
                              <a
                                href={getPublicAssetUrl(receipt.receiptUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-primary underline underline-offset-2"
                              >
                                Ver PDF
                              </a>
                            ) : (
                              <a
                                href={getPublicAssetUrl(receipt.receiptUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block"
                              >
                                <img
                                  src={getPublicAssetUrl(receipt.receiptUrl)}
                                  alt={receipt.receiptName || "Comprobante"}
                                  className="mx-auto h-16 w-16 rounded border border-slate-300 object-cover"
                                />
                              </a>
                            )
                          ) : (
                            <span className="text-slate-400">Sin comprobante</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-400">
                        No hay recibos registrados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <Card className="border-border">
              <CardContent className="space-y-4 pt-6 text-sm">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progreso de pago</span>
                    <span>{paymentProgress.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${paymentProgress}%` }} />
                  </div>
                </div>
                {hasBalance ? (
                  <div className="grid gap-3 p-0 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Saldo pendiente</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(remainingBalance, currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Abono</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(downPayment, currency)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-slate-100 px-4 py-3">
                      <span className="font-bold uppercase text-slate-900">Total</span>
                      <span className="text-lg font-bold text-slate-900">{formatMoney(capital, currency)}</span>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileDown className="h-4 w-4 text-primary" />
                  Descargar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:flex sm:gap-3 sm:space-y-0">
                <DownloadSaleInvoicePdfButton invoiceToken={sale.invoiceToken} saleCode={sale.code} className="w-full sm:w-auto" />
                {receiptUrl ? (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}
                  >
                    <ReceiptText className="h-4 w-4" />
                    Ver comprobante
                  </a>
                ) : null}
              </CardContent>
            </Card>
          </section>

          <section className="rounded-xl bg-zinc-100 px-6 py-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-900">
              Gracias por preferirnos y esperamos poder ser parte de tu proyecto contando siempre con nuestro respaldo y asesoria
            </p>
          </section>
        </>
      )}
    </main>
  );
}
