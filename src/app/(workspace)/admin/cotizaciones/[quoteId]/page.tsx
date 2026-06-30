import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EditQuoteWorkspace } from "@/components/admin/edit-quote-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ quoteId: string }>;
};

export default async function AdminCotizacionDetallePage({ params }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "quotes");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const { quoteId } = await params;

  const [quote, clients, products, currency, stockRows] = await Promise.all([
    prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        client: true,
        items: {
          include: {
            product: true,
            supplier: true,
          },
        },
      },
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
    // Stock por producto (suma de movimientos) para la bolita del selector.
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

  if (!quote) {
    notFound();
  }

  const validUntilValue = quote.validUntil
    ? new Date(quote.validUntil.getTime() - quote.validUntil.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10)
    : "";

  const createdAtValue = new Date(
    quote.createdAt.getTime() - quote.createdAt.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 10);

  return (
    <EditQuoteWorkspace
      quote={{
        id: quote.id,
        code: quote.code,
        status: quote.status,
        validUntil: validUntilValue,
        createdAt: createdAtValue,
        notes: quote.notes ?? "",
        client: {
          id: quote.client.id,
          name: quote.client.name || quote.client.email,
          email: quote.client.email,
          document: quote.client.document ?? "",
          phone: quote.client.phone ?? "",
          address: quote.client.address ?? "",
          neighborhood: quote.client.neighborhood ?? "",
          department: quote.client.department ?? "",
          city: quote.client.city ?? "",
        },
        items: quote.items.map((item) => {
          const meta = parseQuoteItemMeta(item.notes);
          return {
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            description: meta.description,
            color: meta.color,
            additionalCost: meta.additionalCost,
            discount: meta.discount,
            fulfillmentMode: item.fulfillmentMode === "MANUFACTURE" ? "MANUFACTURE" : "STOCK",
            imageUrl: meta.imageUrl,
            comboKey: meta.comboKey,
            comboName: meta.comboName,
            comboCode: meta.comboCode,
            comboQuantity: meta.comboQuantity,
          };
        }),
      }}
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
      currency={currency}
    />
  );
}
