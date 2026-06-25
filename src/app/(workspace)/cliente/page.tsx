import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Receipt, Wallet, Package, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { getSystemCurrency } from "@/lib/system-settings";
import { getOrderStatusLabel } from "@/lib/orders";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  EXPIRED: "Vencida",
};

const SALE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  INVOICED: "Facturada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function ClientePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const [currency, quotes, sales] = await Promise.all([
    getSystemCurrency(),
    prisma.quote.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, code: true, status: true, total: true, shareToken: true, createdAt: true },
    }),
    prisma.sale.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        status: true,
        total: true,
        invoiceToken: true,
        createdAt: true,
        salePayments: { select: { amount: true } },
        order: { select: { code: true, status: true } },
      },
    }),
  ]);

  const salesWithBalance = sales.map((sale) => {
    const total = Number(sale.total);
    const paid = sale.salePayments.reduce((sum, p) => sum + Number(p.amount), 0);
    return { ...sale, total, paid, pending: Math.max(total - paid, 0) };
  });

  const activeSales = salesWithBalance.filter((s) => s.status !== "CANCELLED");
  const pendingTotal = activeSales.reduce((sum, s) => sum + s.pending, 0);
  const openQuotes = quotes.filter((q) => q.status === "SENT" || q.status === "DRAFT").length;
  const activeOrders = activeSales.filter(
    (s) => s.order && s.order.status !== "COMPLETED" && s.order.status !== "CANCELLED",
  ).length;

  const summary = [
    { label: "Cotizaciones abiertas", value: String(openQuotes), icon: FileText, accent: "text-blue-600", bg: "bg-blue-100" },
    { label: "Compras", value: String(activeSales.length), icon: Receipt, accent: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "Pedidos en curso", value: String(activeOrders), icon: Package, accent: "text-amber-600", bg: "bg-amber-100" },
    { label: "Saldo pendiente", value: formatMoney(pendingTotal, currency), icon: Wallet, accent: "text-red-600", bg: "bg-red-100" },
  ];

  return (
    <section className="app-page space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hola, {session.user.name ?? "cliente"}</h1>
        <p className="text-sm text-muted-foreground">Resumen de tus cotizaciones, compras y pedidos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.bg} ${item.accent}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Cotizaciones recientes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {quotes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aún no tienes cotizaciones.</p>
            ) : (
              quotes.map((quote) => (
                <Link
                  key={quote.id}
                  href={`/cotizaciones/${quote.shareToken}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{quote.code}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(quote.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatMoney(Number(quote.total), currency)}</span>
                    <Badge variant="outline">{QUOTE_STATUS_LABEL[quote.status] ?? quote.status}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Mis compras</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {salesWithBalance.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aún no tienes compras registradas.</p>
            ) : (
              salesWithBalance.slice(0, 5).map((sale) => (
                <Link
                  key={sale.id}
                  href={`/sales/${sale.invoiceToken}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{sale.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.order ? getOrderStatusLabel(sale.order.status) : SALE_STATUS_LABEL[sale.status] ?? sale.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatMoney(sale.total, currency)}</p>
                    {sale.pending > 0 ? (
                      <p className="text-xs text-red-600">Saldo {formatMoney(sale.pending, currency)}</p>
                    ) : (
                      <p className="text-xs text-emerald-600">Pagada</p>
                    )}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-start gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">¿Necesitas algo nuevo? Explora el catálogo y solicita una cotización.</p>
          <Link
            href="/catalogo"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ir al catálogo <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
