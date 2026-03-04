import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProductGallery } from "@/components/store/product-gallery";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ productId: string }>;
};

export default async function ProductoDetallePage({ params }: PageProps) {
  const { productId } = await params;
  const [product, currency] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        images: { orderBy: { order: "asc" } },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!product) {
    notFound();
  }

  const gallery = Array.from(
    new Set(
      [product.thumbnailUrl, ...product.images.map((item) => item.url)]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  const whatsAppHref = `https://wa.me/?text=${encodeURIComponent(
    `Hola Innovaciones Magi, quiero comprar el producto: ${product.name}`,
  )}`;

  const relatedProducts = await prisma.product.findMany({
    where: {
      id: { not: product.id },
      ...(product.categoryId ? { categoryId: product.categoryId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 4,
    include: { category: true },
  });

  return (
    <section className="app-page space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--primary-strong)] transition hover:bg-slate-50"
        >
          Volver a tienda
        </Link>
        {product.category?.name ? (
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-[var(--line)]">
            {product.category.name}
          </span>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <ProductGallery name={product.name} images={gallery} />

        <Card className="space-y-4 rounded-2xl">
          <div className="space-y-2 border-b border-[var(--line)] pb-4">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{product.name}</h1>
            {product.description ? (
              <p className="text-sm leading-6 text-slate-600">{product.description}</p>
            ) : (
              <p className="text-sm text-slate-500">Este producto no tiene descripcion disponible.</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--primary)] bg-white px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Precio detal</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                {formatMoney(String(product.price), currency)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Precio mayorista</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {formatMoney(String(product.wholesalePrice), currency)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Minimo {product.minWholesaleQty} unidades</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Link
                href={whatsAppHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
              >
                <MessageCircle className="h-4 w-4" />
                Comprar por WhatsApp
              </Link>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)]"
              >
                <ShoppingCart className="h-4 w-4" />
                Comprar
              </button>
            </div>
            {product.code ? (
              <p className="text-xs text-slate-500">
                Codigo de referencia: <span className="font-medium text-slate-700">{product.code}</span>
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      {relatedProducts.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Productos relacionados</h2>
            <Link href="/" className="text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-strong)]">
              Ver toda la tienda
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((item) => (
              <Link key={item.id} href={`/productos/${item.id}`} className="group block">
                <Card className="h-full overflow-hidden rounded-xl p-0 transition group-hover:translate-y-[-2px] group-hover:shadow-[0_20px_35px_-30px_rgba(15,23,42,0.45)]">
                  <div className="relative">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.name}
                      className="h-36 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                    {item.category?.name ? (
                      <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        {item.category.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1.5 px-3 py-3">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-sm font-semibold text-[var(--primary-strong)]">
                      {formatMoney(String(item.price), currency)}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
