import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuotesWorkspace } from "@/components/admin/quotes-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { comboStock } from "@/lib/combo";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { partesPorProducto } from "@/lib/product-parts.server";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";
import {
  COMBO_CHECK_PRODUCT_SELECT,
  isCamillaComboProduct,
  toComboCheckProduct,
} from "@/modules/ventas/domain/payment-method";
import { badgeOriginDetail } from "@/modules/ventas/domain/sale-origin";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminCotizacionesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "quotes");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  // El dueño (ADMIN) ve todas las cotizaciones; un empleado solo las que creó.
  const onlyOwnQuotes = session.user.role !== "ADMIN";

  const [quotes, clients, products, currency, accounts, stockRows] = await Promise.all([
    prisma.quote.findMany({
      where: onlyOwnQuotes ? { createdById: session.user.id } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        createdBy: { select: { name: true, email: true } },
        items: {
          include: { product: { select: COMBO_CHECK_PRODUCT_SELECT } },
        },
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
        bundleComponents: {
          orderBy: { sortOrder: "asc" },
          include: {
            child: true,
            alternates: { orderBy: { sortOrder: "asc" }, include: { product: true } },
          },
        },
      },
      take: 500,
    }),
    getSystemCurrency(),
    prisma.account.findMany({
      where: { isActive: true, type: { not: "OWNER" } },
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
  // piezas (cada pieza suma sus alternas), ver comboStock.
  const stockByProduct = new Map(stockRows.map((row) => [row.productId, row._sum.change ?? 0]));
  // Partes de color de cada producto (propias o de su categoría) para el selector por parte.
  const partesById = await partesPorProducto(
    prisma,
    products.map((product) => product.id),
  );
  const stockOf = (productId: string) => stockByProduct.get(productId) ?? 0;
  const stockFor = (product: (typeof products)[number]): number =>
    product.isBundle ? comboStock(product.bundleComponents, stockOf) : stockOf(product.id);

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
          advisorName: quote.createdBy.name || quote.createdBy.email,
          total: Number(quote.total),
          status: quote.status,
          createdAt: quote.createdAt.toLocaleDateString("es-CO"),
          createdAtISO: quote.createdAt.toISOString(),
          shareToken: quote.shareToken,
          hasSale: Boolean(quote.sale),
          origin: quote.origin ?? null,
          originDetail: badgeOriginDetail(quote.originDetail),
          hasCamillaCombo: quote.items.some((item) => isCamillaComboProduct(toComboCheckProduct(item.product))),
          // Casilla «Cliente aprobó colores»: si alguna línea trae color por parte (el servidor revisa de nuevo).
          hasColorParts: quote.items.some((item) => parseQuoteItemMeta(item.notes).partes.length > 0),
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
          isBundle: product.isBundle,
          partes: partesById.get(product.id) ?? [],
          components: product.bundleComponents.map((component) => ({
            productId: component.childId,
            name: component.child.name,
            code: component.child.code,
            quantity: component.quantity,
            retailPrice: Number(component.child.price),
            stock: stockOf(component.childId),
            alternates: component.alternates.map((alt) => ({
              productId: alt.productId,
              name: alt.product.name,
              code: alt.product.code,
              retailPrice: Number(alt.product.price),
              stock: stockOf(alt.productId),
            })),
          })),
        }))}
      />
    </section>
  );
}

