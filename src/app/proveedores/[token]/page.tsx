import { notFound } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Factory,
  Hash,
  Package,
  Tag,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SupplierBalanceMonthSelect } from "@/components/admin/supplier-balance-month-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function SupplierBalancePublicPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  const supplier = await prisma.supplier.findUnique({
    where: { shareToken: token },
    select: { id: true, name: true, displayName: true, type: true },
  });

  if (!supplier) {
    notFound();
  }

  const [items, payments, currency] = await Promise.all([
    prisma.orderItem.findMany({
      where: { confirmedSupplierId: supplier.id },
      orderBy: { confirmedAt: "desc" },
      select: {
        id: true,
        quantity: true,
        purchaseCost: true,
        supplierPaymentStatus: true,
        confirmedAt: true,
        createdAt: true,
        product: { select: { name: true, code: true, thumbnailUrl: true } },
        order: { select: { id: true, code: true } },
        photos: { select: { id: true } },
      },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { supplierId: supplier.id, type: "PAYMENT" },
      select: { orderItemId: true, orderId: true, paymentDate: true, createdAt: true },
    }),
    getSystemCurrency(),
  ]);

  const paidDateByItem = new Map<string, Date>();
  const paidDateByOrder = new Map<string, Date>();
  for (const payment of payments) {
    const date = payment.paymentDate ?? payment.createdAt;
    if (payment.orderItemId) {
      const current = paidDateByItem.get(payment.orderItemId);
      if (!current || date > current) paidDateByItem.set(payment.orderItemId, date);
    }
    if (payment.orderId) {
      const current = paidDateByOrder.get(payment.orderId);
      if (!current || date > current) paidDateByOrder.set(payment.orderId, date);
    }
  }

  const now = new Date();
  const currentMonthKey = monthKeyOf(now);
  const selectedMonth = typeof query.month === "string" && /^\d{4}-\d{2}$/.test(query.month)
    ? query.month
    : currentMonthKey;

  const allRows = items.map((item) => {
    const amount = Number(item.purchaseCost ?? 0) * item.quantity;
    const isPaid = item.supplierPaymentStatus === "PAID";
    const isFinished = item.photos.length > 0 && item.supplierPaymentStatus !== null;
    const paidDate = isPaid
      ? paidDateByItem.get(item.id) ?? paidDateByOrder.get(item.order.id) ?? item.createdAt
      : null;
    const bucketMonth = paidDate ? monthKeyOf(paidDate) : currentMonthKey;
    return {
      id: item.id,
      orderCode: item.order.code,
      productName: item.product.name,
      productCode: item.product.code,
      productImage: getPublicAssetUrl(item.product.thumbnailUrl),
      quantity: item.quantity,
      amount,
      isPaid,
      isFinished,
      bucketMonth,
      date: (paidDate ?? item.confirmedAt ?? item.createdAt).toLocaleDateString("es-CO"),
    };
  });

  const monthSet = new Set<string>([currentMonthKey]);
  for (const row of allRows) {
    if (row.isPaid) monthSet.add(row.bucketMonth);
  }
  if (!monthSet.has(selectedMonth)) monthSet.add(selectedMonth);
  const months = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ value: key, label: monthLabelOf(key) }));

  const rows = allRows.filter((row) => row.bucketMonth === selectedMonth);

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const pagados = rows.filter((row) => row.isPaid).reduce((sum, row) => sum + row.amount, 0);
  const terminados = rows.filter((row) => row.isFinished).reduce((sum, row) => sum + row.amount, 0);
  const saldoPendiente = total - pagados;

  const cards: { label: string; value: number; accent?: string; sub?: string }[] = [
    { label: "Total", value: total, sub: `${rows.length} productos` },
    { label: "Terminados", value: terminados, accent: "text-emerald-600" },
    { label: "Pagados", value: pagados, accent: "text-emerald-600" },
    { label: "Saldo pendiente", value: saldoPendiente, accent: "text-red-600" },
  ];

  const companyInfo = {
    name: "Magilus",
    nit: "100.61.80.650",
    cityOrigin: "Cali - Bogotá",
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-col gap-3 overflow-hidden rounded-xl border border-slate-200/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-black text-white sm:h-12 sm:w-12 sm:text-2xl">
            M
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{companyInfo.name}</p>
            <p className="text-xs text-slate-500">NIT {companyInfo.nit}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <div className="flex items-baseline gap-2 sm:justify-end">
            <p className="text-lg font-bold uppercase tracking-tight text-slate-900 sm:text-2xl">Balance</p>
            <h1 className="max-w-full break-words text-lg font-extrabold tracking-tight text-slate-400 sm:text-2xl">
              {supplier.displayName || supplier.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <Building2 className="h-4 w-4" /> {companyInfo.cityOrigin}
            </span>
            <div className="w-40 shrink-0">
              <SupplierBalanceMonthSelect months={months} value={selectedMonth} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="border-border bg-card/95 py-2">
            <CardContent className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
              <p className={`text-base font-semibold sm:text-lg ${card.accent ?? "text-foreground"}`}>
                {formatMoney(card.value, currency)}
              </p>
              {card.sub ? <p className="text-xs text-muted-foreground">{card.sub}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <Table className="min-w-[760px] [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-px whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />Fecha</span>
              </TableHead>
              <TableHead className="w-px whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-muted-foreground" />Cant</span>
              </TableHead>
              <TableHead className="w-px whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />Orden</span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-muted-foreground" />Producto</span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-muted-foreground" />Precio</span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5"><Factory className="h-3.5 w-3.5 text-muted-foreground" />Estado</span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-muted-foreground" />Pago</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-9 text-center text-muted-foreground">
                  Sin productos para {monthLabelOf(selectedMonth)}.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="w-px whitespace-nowrap text-xs text-muted-foreground">{row.date}</TableCell>
                  <TableCell className="w-px whitespace-nowrap text-sm text-muted-foreground">{row.quantity}</TableCell>
                  <TableCell className="w-px whitespace-nowrap text-sm font-semibold text-foreground">{row.orderCode}</TableCell>
                  <TableCell className="text-sm text-foreground">
                    <div className="flex items-stretch gap-2">
                      <div className="-my-1.5 w-10 shrink-0 self-stretch overflow-hidden border-r border-border bg-muted/40">
                        {row.productImage ? (
                          <img src={row.productImage} alt={row.productName} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 self-center leading-tight">
                        <p className="truncate">{row.productName}</p>
                        {row.productCode ? (
                          <p className="text-[11px] text-muted-foreground">{row.productCode}</p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">{formatMoney(row.amount, currency)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.isFinished
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
                          : "border-amber-500/30 bg-amber-500/15 text-amber-600"
                      }
                    >
                      {row.isFinished ? "Terminado" : "En fabricacion"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.isPaid
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
                          : "border-border bg-muted text-muted-foreground"
                      }
                    >
                      {row.isPaid ? "Pagado" : "Pendiente"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Vista movil en tarjetas */}
      <div className="space-y-2 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            Sin productos para {monthLabelOf(selectedMonth)}.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
                  {row.productImage ? (
                    <img src={row.productImage} alt={row.productName} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium text-foreground">{row.productName}</p>
                  {row.productCode ? (
                    <p className="text-[11px] text-muted-foreground">{row.productCode}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(row.amount, currency)}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {row.orderCode} · {row.date} · x{row.quantity}
                </span>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={
                      row.isFinished
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
                        : "border-amber-500/30 bg-amber-500/15 text-amber-600"
                    }
                  >
                    {row.isFinished ? "Terminado" : "En fabricacion"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      row.isPaid
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
                        : "border-border bg-muted text-muted-foreground"
                    }
                  >
                    {row.isPaid ? "Pagado" : "Pendiente"}
                  </Badge>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
