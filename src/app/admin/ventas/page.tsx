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
      },
      take: 200,
    }),
    getSystemCurrency(),
  ]);

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Sales updated"
        errorTitle="Sales error"
      />

      <SalesWorkspace
        currency={currency}
        sales={sales.map((sale) => ({
          id: sale.id,
          code: sale.code,
          quoteCode: sale.quote.code,
          clientName: sale.client.name || sale.client.email,
          total: Number(sale.total),
          status: sale.status,
          createdAt: sale.createdAt.toLocaleDateString("es-CO"),
          invoiceToken: sale.invoiceToken,
          paymentReceiptUrl: sale.paymentReceiptUrl,
          paymentReceiptType: sale.paymentReceiptType,
        }))}
      />
    </section>
  );
}
