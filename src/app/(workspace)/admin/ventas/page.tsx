import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { SalesWorkspace } from "@/components/admin/sales-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";

type SaleWithDiscountFields = {
  grossTotal?: unknown;
  discountAmount?: unknown;
  quote: {
    total: unknown;
  };
  salePayments?: Array<{
    id?: unknown;
    amount: unknown;
    paymentMethod?: unknown;
    note?: unknown;
    receiptUrl?: unknown;
    receiptName?: unknown;
    receiptType?: unknown;
    createdAt?: unknown;
  }>;
};

function formatPaymentDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toLocaleDateString("es-CO");
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString("es-CO");
  }
  return null;
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminVentasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "sales");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [sales, products, currency] = await Promise.all([
    prisma.sale.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        quote: true,
        order: true,
        salePayments: {
          orderBy: { sortOrder: "asc" },
        },
      },
      take: 200,
    }),
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    getSystemCurrency(),
  ]);

  const stats = sales.reduce(
    (acc, sale) => {
      const saleWithDiscount = sale as SaleWithDiscountFields;
      const grossTotal = Number(saleWithDiscount.grossTotal ?? sale.quote.total);
      const discountAmount = Number(saleWithDiscount.discountAmount ?? 0);
      const capital = Number(sale.total);
      const downPayment = Array.isArray(saleWithDiscount.salePayments)
        ? saleWithDiscount.salePayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
        : Number(sale.downPaymentAmount);
      const remaining = Math.max(capital - downPayment, 0);

      acc.salesCount += 1;
      acc.grossTotal += grossTotal;
      acc.discountTotal += discountAmount;
      acc.capitalTotal += capital;
      acc.downPaymentTotal += downPayment;
      acc.remainingTotal += remaining;
      if (downPayment >= capital) {
        acc.paidSalesCount += 1;
      }

      return acc;
    },
    {
      salesCount: 0,
      grossTotal: 0,
      discountTotal: 0,
      capitalTotal: 0,
      downPaymentTotal: 0,
      remainingTotal: 0,
      paidSalesCount: 0,
    },
  );

  const format = (value: number) => formatMoney(value, currency);

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Ventas actualizadas"
        errorTitle="Error en ventas"
      />

      <SalesWorkspace
        currency={currency}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          code: product.code,
          retailPrice: Number(product.price),
          thumbnailUrl: getPublicAssetUrl(product.thumbnailUrl),
        }))}
        sales={sales.map((sale) => ({
          id: sale.id,
          code: sale.code,
          quoteCode: sale.quote.code,
          clientName: sale.client.name || sale.client.email,
          total: Number(sale.total),
          grossTotal: Number((sale as SaleWithDiscountFields).grossTotal ?? sale.quote.total),
          discountAmount: Number((sale as SaleWithDiscountFields).discountAmount ?? 0),
          downPaymentAmount: Array.isArray((sale as SaleWithDiscountFields).salePayments)
            ? (sale as SaleWithDiscountFields).salePayments!.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
            : Number(sale.downPaymentAmount),
          remainingBalance: Math.max(
            Number(sale.total) -
              (Array.isArray((sale as SaleWithDiscountFields).salePayments)
                ? (sale as SaleWithDiscountFields).salePayments!.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
                : Number(sale.downPaymentAmount)),
            0,
          ),
          status: sale.status,
          createdAt: sale.createdAt.toLocaleDateString("es-CO"),
          invoiceToken: sale.invoiceToken,
          paymentReceiptUrl: sale.paymentReceiptUrl,
          paymentReceiptType: sale.paymentReceiptType,
          salePayments: Array.isArray((sale as SaleWithDiscountFields).salePayments)
            ? (sale as SaleWithDiscountFields).salePayments!.map((payment) => ({
                id: typeof payment.id === "string" ? payment.id : "",
                amount: Number(payment.amount ?? 0),
                paymentMethod: typeof payment.paymentMethod === "string" ? payment.paymentMethod : "",
                note: typeof payment.note === "string" && payment.note.trim() ? payment.note.trim() : null,
                receiptUrl: typeof payment.receiptUrl === "string" && payment.receiptUrl.trim() ? payment.receiptUrl.trim() : null,
                receiptName: typeof payment.receiptName === "string" && payment.receiptName.trim() ? payment.receiptName.trim() : null,
                receiptType: typeof payment.receiptType === "string" && payment.receiptType.trim() ? payment.receiptType.trim() : null,
                paidAt: formatPaymentDate(payment.createdAt),
              }))
            : [],
          hasOrder: Boolean(sale.order),
        }))}
        stats={{
          salesCount: stats.salesCount,
          grossTotal: format(stats.grossTotal),
          discountTotal: format(stats.discountTotal),
          capitalTotal: format(stats.capitalTotal),
          downPaymentTotal: format(stats.downPaymentTotal),
          remainingTotal: format(stats.remainingTotal),
          paidSalesCount: stats.paidSalesCount,
        }}
      />
    </section>
  );
}
