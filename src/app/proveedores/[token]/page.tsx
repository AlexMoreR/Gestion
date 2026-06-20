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
        order: { select: { code: true } },
        photos: { select: { id: true } },
      },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { supplierId: supplier.id, type: "PAYMENT", orderItemId: { not: null } },
      select: { orderItemId: true, paymentDate: true, createdAt: true },
    }),
    getSystemCurrency(),
  ]);

  const paidDateByItem = new Map<string, Date>();
  for (const payment of payments) {
    if (!payment.orderItemId) continue;
    const date = payment.paymentDate ?? payment.createdAt;
    const current = paidDateByItem.get(payment.orderItemId);
    if (!current || date > current) {
      paidDateByItem.set(payment.orderItemId, date);
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
    const paidDate = isPaid ? paidDateByItem.get(item.id) ?? item.createdAt : null;
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
  const enFabricacion = rows.filter((row) => !row.isFinished).reduce((sum, row) => sum + row.amount, 0);
  const saldoPendiente = total - pagados;

  const cards: { label: string; value: number; accent?: string; sub?: string }[] = [
    { label: "Total", value: total, sub: `${rows.length} productos` },
    { label: "En fabricacion", value: enFabricacion, accent: "text-amber-600" },
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
      <div className="flex flex-row items-center justify-between gap-3 overflow-hidden rounded-xl border border-slate-200/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-2xl font-black text-white">
            M
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight text-slate-900">{companyInfo.name}</p>
            <p className="text-xs text-slate-500">NIT {companyInfo.nit}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-baseline justify-end gap-2">
            <p className="text-xl font-bold uppercase tracking-tight text-slate-900 sm:text-2xl">Balance</p>
            <h1 className="max-w-full break-all text-xl font-extrabold tracking-tight text-slate-400 sm:text-2xl">
              {supplier.displayName || supplier.name}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <Building2 className="h-4 w-4" /> {companyInfo.cityOrigin}
            </span>
            <div className="w-40 shrink-0">
              <SupplierBalanceMonthSelect months={months} value={selectedMonth} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} className="border-border bg-card/95 py-2">
            <CardContent className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
              <p className={`text-lg font-semibold ${card.accent ?? "text-foreground"}`}>
                {formatMoney(card.value, currency)}
              </p>
              {card.sub ? <p className="text-xs text-muted-foreground">{card.sub}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
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
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
                        {row.productImage ? (
                          <img src={row.productImage} alt={row.productName} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 leading-tight">
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
    </main>
  );
}
