import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuotesWorkspace } from "@/components/admin/quotes-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminCotizacionesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [quotes, clients, products, currency] = await Promise.all([
    prisma.quote.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        items: true,
      },
      take: 200,
    }),
    prisma.user.findMany({
      where: { role: "CLIENTE" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 400,
    }),
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        suppliers: {
          include: {
            supplier: true,
          },
        },
      },
      take: 500,
    }),
    getSystemCurrency(),
  ]);

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Cotizaciones actualizadas"
        errorTitle="Error en cotizaciones"
      />

      <QuotesWorkspace
        currency={currency}
        quotes={quotes.map((quote) => ({
          id: quote.id,
          code: quote.code,
          clientName: quote.client.name || quote.client.email,
          itemsCount: quote.items.length,
          total: Number(quote.total),
          status: quote.status,
          createdAt: quote.createdAt.toLocaleDateString("es-CO"),
          shareToken: quote.shareToken,
        }))}
        clients={clients.map((client) => ({
          id: client.id,
          name: client.name || "Cliente sin nombre",
          email: client.email,
        }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          code: product.code,
          retailPrice: Number(product.price),
          suppliers: product.suppliers.map((row) => ({
            id: row.supplierId,
            name: row.supplier.name,
          })),
        }))}
      />
    </section>
  );
}

