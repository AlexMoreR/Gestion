import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { SalesWorkspace } from "@/components/admin/sales-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
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

  const [sales, products, clients, currency, accounts] = await Promise.all([
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
      include: {
        bundleComponents: {
          orderBy: { sortOrder: "asc" },
          include: { child: true },
        },
      },
      take: 500,
    }),
    prisma.user.findMany({
      where: { role: "CLIENTE" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        document: true,
        phone: true,
        address: true,
      },
      take: 400,
    }),
    getSystemCurrency(),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
  ]);

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
        accounts={accounts}
        clients={clients.map((client) => ({
          id: client.id,
          name: client.name || "Cliente sin nombre",
          email: client.email,
          document: client.document ?? "",
          phone: client.phone ?? "",
          address: client.address ?? "",
        }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          code: product.code,
          retailPrice: Number(product.price),
          thumbnailUrl: getPublicAssetUrl(product.thumbnailUrl),
          isBundle: product.isBundle,
          components: product.bundleComponents.map((component) => ({
            productId: component.childId,
            name: component.child.name,
            code: component.child.code,
            quantity: component.quantity,
            retailPrice: Number(component.child.price),
            thumbnailUrl: getPublicAssetUrl(component.child.thumbnailUrl),
          })),
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
          createdAtISO: sale.createdAt.toISOString(),
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
      />
    </section>
  );
}
