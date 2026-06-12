import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { SalesWorkspace } from "@/components/admin/sales-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

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

  const [sales, currency] = await Promise.all([
    prisma.sale.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        quote: true,
        order: true,
      },
      take: 200,
    }),
    getSystemCurrency(),
  ]);

  const stats = sales.reduce(
    (acc, sale) => {
      const capital = Number(sale.total);
      const downPayment = Number(sale.downPaymentAmount);
      const remaining = Math.max(capital - downPayment, 0);

      acc.salesCount += 1;
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
      capitalTotal: 0,
      downPaymentTotal: 0,
      remainingTotal: 0,
      paidSalesCount: 0,
    },
  );

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
        stats={stats}
        sales={sales.map((sale) => ({
          id: sale.id,
          code: sale.code,
          quoteCode: sale.quote.code,
          clientName: sale.client.name || sale.client.email,
          total: Number(sale.total),
          downPaymentAmount: Number(sale.downPaymentAmount),
          remainingBalance: Math.max(Number(sale.total) - Number(sale.downPaymentAmount), 0),
          status: sale.status,
          createdAt: sale.createdAt.toLocaleDateString("es-CO"),
          invoiceToken: sale.invoiceToken,
          paymentReceiptUrl: sale.paymentReceiptUrl,
          paymentReceiptType: sale.paymentReceiptType,
          hasOrder: Boolean(sale.order),
        }))}
      />
    </section>
  );
}
