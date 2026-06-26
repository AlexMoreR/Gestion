import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuotesWorkspace } from "@/components/admin/quotes-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminCotizacionesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "quotes");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [quotes, clients, products, currency, accounts, stockRows] = await Promise.all([
    prisma.quote.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        items: true,
        sale: true,
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
        neighborhood: true,
        department: true,
        city: true,
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
        bundleComponents: {
          orderBy: { sortOrder: "asc" },
          include: { child: true },
        },
      },
      take: 500,
    }),
    getSystemCurrency(),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    // Stock por producto (suma de movimientos) para la bolita del modal.
    prisma.inventoryMovement.groupBy({
      by: ["productId"],
      _sum: { change: true },
    }),
  ]);

  // Stock de productos normales; para combos, cuantos se pueden armar con sus
  // componentes (minimo de stock del componente / unidades requeridas).
  const stockByProduct = new Map(stockRows.map((row) => [row.productId, row._sum.change ?? 0]));
  const stockFor = (product: (typeof products)[number]): number => {
    if (product.isBundle) {
      const valid = product.bundleComponents.filter((component) => component.quantity > 0);
      if (valid.length === 0) return 0;
      return Math.min(
        ...valid.map((component) => Math.floor((stockByProduct.get(component.childId) ?? 0) / component.quantity)),
      );
    }
    return stockByProduct.get(product.id) ?? 0;
  };

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
        accounts={accounts}
        quotes={quotes.map((quote) => ({
          id: quote.id,
          code: quote.code,
          clientName: quote.client.name || quote.client.email,
          itemsCount: quote.items.length,
          total: Number(quote.total),
          status: quote.status,
          createdAt: quote.createdAt.toLocaleDateString("es-CO"),
          createdAtISO: quote.createdAt.toISOString(),
          shareToken: quote.shareToken,
          hasSale: Boolean(quote.sale),
        }))}
        clients={clients.map((client) => ({
          id: client.id,
          name: client.name || "Cliente sin nombre",
          email: client.email,
          document: client.document ?? "",
          phone: client.phone ?? "",
          address: client.address ?? "",
          neighborhood: client.neighborhood ?? "",
          department: client.department ?? "",
          city: client.city ?? "",
        }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          code: product.code,
          stock: stockFor(product),
          retailPrice: Number(product.price),
          wholesalePrice: Number(product.wholesalePrice),
          minWholesaleQty: product.minWholesaleQty,
          thumbnailUrl: getPublicAssetUrl(product.thumbnailUrl),
          suppliers: product.suppliers.map((row) => ({
            id: row.supplierId,
            name: row.supplier.name,
          })),
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
      />
    </section>
  );
}

