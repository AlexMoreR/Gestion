import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SupplierBalanceMonthSelect } from "@/components/admin/supplier-balance-month-select";
import { SupplierBalanceItems } from "@/components/admin/supplier-balance-items";
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
      select: { orderItemId: true, orderId: true, paymentDate: true, createdAt: true, receiptUrl: true },
    }),
    getSystemCurrency(),
  ]);

  const paidDateByItem = new Map<string, Date>();
  const paidDateByOrder = new Map<string, Date>();
  const receiptByItem = new Map<string, string>();
  const receiptByOrder = new Map<string, string>();
  for (const payment of payments) {
    const date = payment.paymentDate ?? payment.createdAt;
    if (payment.orderItemId) {
      const current = paidDateByItem.get(payment.orderItemId);
      if (!current || date > current) {
        paidDateByItem.set(payment.orderItemId, date);
        if (payment.receiptUrl) receiptByItem.set(payment.orderItemId, payment.receiptUrl);
      }
    }
    if (payment.orderId) {
      const current = paidDateByOrder.get(payment.orderId);
      if (!current || date > current) {
        paidDateByOrder.set(payment.orderId, date);
        if (payment.receiptUrl) receiptByOrder.set(payment.orderId, payment.receiptUrl);
      }
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
    const receiptRaw = isPaid
      ? receiptByItem.get(item.id) ?? receiptByOrder.get(item.order.id) ?? null
      : null;
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
      receiptUrl: receiptRaw ? getPublicAssetUrl(receiptRaw) : null,
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

      <SupplierBalanceItems
        rows={rows}
        currency={currency}
        emptyLabel={`Sin productos para ${monthLabelOf(selectedMonth)}.`}
        header={{
          fecha: "Fecha",
          cant: "Cant",
          orden: "Orden",
          producto: "Producto",
          precio: "Precio",
          estado: "Estado",
          pago: "Pago",
        }}
      />
    </main>
  );
}
