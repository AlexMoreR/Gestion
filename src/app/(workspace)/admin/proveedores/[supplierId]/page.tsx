import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Factory,
  Hash,
  Package,
  Tag,
  Wallet,
  Truck,
} from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SupplierBalanceMonthSelect } from "@/components/admin/supplier-balance-month-select";
import { SupplierShareLinkButton } from "@/components/admin/supplier-share-link-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ supplierId: string }>;
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

export default async function AdminSupplierBalancePage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "suppliers");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const { supplierId } = await params;
  const query = await searchParams;

  const [supplier, items, payments, charges, currency] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, displayName: true, type: true, shareToken: true },
    }),
    prisma.orderItem.findMany({
      where: { confirmedSupplierId: supplierId },
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
      where: { supplierId, type: "PAYMENT" },
      select: { orderItemId: true, orderId: true, amount: true, paymentDate: true, createdAt: true },
    }),
    // Cargos que NO provienen de una orden: compras de inventario y cargos manuales.
    // (Los cargos de una orden ya se reflejan via los orderItem de arriba.)
    prisma.supplierLedgerEntry.findMany({
      where: { supplierId, type: "CHARGE", orderId: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        note: true,
        paymentDate: true,
        createdAt: true,
        inventoryMovement: {
          select: {
            change: true,
            product: { select: { name: true, code: true, thumbnailUrl: true } },
          },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!supplier) {
    notFound();
  }

  // Genera el token de link publico la primera vez que se abre el balance.
  let shareToken = supplier.shareToken;
  if (!shareToken) {
    shareToken = randomUUID();
    await prisma.supplier.update({ where: { id: supplier.id }, data: { shareToken } });
  }

  // Fecha de pago por item y por orden (la mas reciente si hubiera varias).
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

  type BalanceRow = {
    id: string;
    orderId: string | null;
    orderCode: string;
    productName: string;
    productCode: string | null;
    productImage: string | null;
    quantity: number | null;
    amount: number;
    isPaid: boolean;
    isFinished: boolean;
    bucketMonth: string;
    date: string;
  };

  const orderRows: BalanceRow[] = items.map((item) => {
    const amount = Number(item.purchaseCost ?? 0) * item.quantity;
    const isPaid = item.supplierPaymentStatus === "PAID";
    // "Terminado" sigue la misma logica de la orden: recogido = tiene fotos y estado de pago definido.
    const isFinished = item.photos.length > 0 && item.supplierPaymentStatus !== null;
    const paidDate = isPaid
      ? paidDateByItem.get(item.id) ?? paidDateByOrder.get(item.order.id) ?? item.createdAt
      : null;
    // Pagado: mes del pago. Pendiente: mes en que se confirmo/creo la orden (no el mes actual).
    const bucketMonth = paidDate
      ? monthKeyOf(paidDate)
      : monthKeyOf(item.confirmedAt ?? item.createdAt);
    return {
      id: item.id,
      orderId: item.order.id,
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

  // Compras de inventario y cargos manuales: se muestran como filas pendientes.
  // El pago de estos se hace con un abono general al proveedor (cargos - abonos).
  const chargeRows: BalanceRow[] = charges.map((charge) => {
    const chargeDate = charge.paymentDate ?? charge.createdAt;
    const product = charge.inventoryMovement?.product ?? null;
    return {
      id: charge.id,
      orderId: null,
      orderCode: "Inventario",
      productName: product?.name ?? charge.note ?? "Cargo",
      productCode: product?.code ?? null,
      productImage: product?.thumbnailUrl ? getPublicAssetUrl(product.thumbnailUrl) : null,
      quantity: charge.inventoryMovement ? Math.abs(charge.inventoryMovement.change) : null,
      amount: Number(charge.amount),
      isPaid: false,
      isFinished: true,
      bucketMonth: monthKeyOf(chargeDate),
      date: chargeDate.toLocaleDateString("es-CO"),
    };
  });

  // Abonos generales (no atados a una orden): reducen el saldo de los cargos de inventario/manuales.
  const generalAbonos = payments
    .filter((payment) => !payment.orderId && !payment.orderItemId)
    .map((payment) => ({
      amount: Number(payment.amount),
      month: monthKeyOf(payment.paymentDate ?? payment.createdAt),
    }));

  const allRows = [...orderRows, ...chargeRows];

  // Meses disponibles: el actual + todos los meses con filas o con abonos generales.
  const monthSet = new Set<string>([currentMonthKey]);
  for (const row of allRows) monthSet.add(row.bucketMonth);
  for (const abono of generalAbonos) monthSet.add(abono.month);
  if (!monthSet.has(selectedMonth)) monthSet.add(selectedMonth);
  const months = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ value: key, label: monthLabelOf(key) }));

  const rows = allRows.filter((row) => row.bucketMonth === selectedMonth);
  const abonosDelMes = generalAbonos
    .filter((abono) => abono.month === selectedMonth)
    .reduce((sum, abono) => sum + abono.amount, 0);

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  // Pagados = items de orden pagados + abonos generales del mes (que saldan los cargos de inventario).
  const pagados =
    rows.filter((row) => row.isPaid).reduce((sum, row) => sum + row.amount, 0) + abonosDelMes;
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

  return (
    <section className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-slate-50 text-slate-700">
            {supplier.type === "SHIPPING" ? <Truck className="h-4 w-4" /> : <Factory className="h-4 w-4" />}
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{supplier.displayName || supplier.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <SupplierShareLinkButton path={`/proveedores/${shareToken}`} />
          <div className="w-48 shrink-0">
            <SupplierBalanceMonthSelect months={months} value={selectedMonth} />
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
                  <TableCell className="w-px whitespace-nowrap text-sm text-muted-foreground">{row.quantity ?? "—"}</TableCell>
                  <TableCell className="w-px whitespace-nowrap">
                    {row.orderId ? (
                      <Link href={`/admin/ordenes/${row.orderId}`} className="text-sm font-semibold text-foreground hover:underline">
                        {row.orderCode}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground">{row.orderCode}</span>
                    )}
                  </TableCell>
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
    </section>
  );
}
