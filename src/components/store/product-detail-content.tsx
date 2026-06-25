import Link from "next/link";
import { MessageCircle, ShoppingCart, Star } from "lucide-react";
import { adminDeleteProductReviewAction } from "@/app/actions/product-review-actions";
import { ProductGallery } from "@/components/store/product-gallery";
import { ProductReviewForm } from "@/components/store/product-review-form";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import type { SupportedCurrencyCode } from "@/lib/currency";
import { buildProductPath } from "@/lib/product-slugs";
import { getPublicAssetUrl, getSiteUrl, sanitizeDescription, siteConfig } from "@/lib/site";
import { buildSystemWhatsAppHref, getSystemBrandName } from "@/lib/system-settings";
import { Button } from "../ui/button";

type ProductDetailContentProps = {
  product: {
    id: string;
    slug: string;
    name: string;
    code: string | null;
    description: string | null;
    seoDescription: string | null;
    price: unknown;
    wholesalePrice: unknown;
    minWholesaleQty: number;
    thumbnailUrl: string;
    categoryId: string | null;
    category: { name: string; slug: string } | null;
    images: Array<{ url: string }>;
    reviews: Array<{
      id: string;
      authorName: string | null;
      rating: number;
      comment: string;
      photoUrl: string | null;
      createdAt: Date;
    }>;
  };
  currency: SupportedCurrencyCode;
  isAdmin?: boolean;
  relatedProducts: Array<{
    id: string;
    slug: string;
    name: string;
    price: unknown;
    thumbnailUrl: string;
    code: string | null;
    category: { name: string; slug: string } | null;
  }>;
};

export async function ProductDetailContent({
  product,
  currency,
  relatedProducts,
  isAdmin = false,
}: ProductDetailContentProps) {
  const brandName = await getSystemBrandName();
  const reviews = product.reviews ?? [];
  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount : 0;
  // Sin reseñas mostramos 5 estrellas decorativas; con reseñas, el promedio real redondeado.
  const displayStars = reviewCount > 0 ? Math.round(averageRating) : 5;
  const gallery = Array.from(
    new Set(
      [product.thumbnailUrl, ...product.images.map((item) => item.url)]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  const whatsAppHref = await buildSystemWhatsAppHref(`Hola ${brandName}, quiero comprar el producto: ${product.name}`);
  const productDescription = sanitizeDescription(
    product.seoDescription || product.description,
    `${product.name} disponible en ${brandName} para proyectos de salon, barberia y mobiliario profesional premium.`,
  );
  const canonicalPath = buildProductPath(product);
  // Precio "antes" decorativo (+25%) para mostrar el ahorro, consistente con el grid del catalogo.
  const retailPrice = Number(product.price);
  const comparePrice = retailPrice * 1.25;
  const savings = Math.max(0, comparePrice - retailPrice);
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${getSiteUrl(canonicalPath)}#product`,
    name: product.name,
    description: productDescription,
    image: gallery.map((url) => getPublicAssetUrl(url)),
    sku: product.code ?? undefined,
      brand: {
        "@type": "Brand",
        name: brandName,
      },
    category: product.category?.name ?? "Mobiliario profesional",
    offers: {
      "@type": "Offer",
      url: getSiteUrl(canonicalPath),
      priceCurrency: currency,
      price: Number(product.price),
      availability: "https://schema.org/InStock",
        seller: {
          "@type": "Organization",
          name: brandName,
        },
    },
  };

  return (
    <section className="app-page space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      <div className="flex items-center justify-between">
        <Link
          href={product.category?.slug ? `/${product.category.slug}` : "/"}
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

        <div className="space-y-4">
          <div className="space-y-2.5 border-b border-[var(--line)] pb-4">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{product.name}</h1>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5 text-amber-400" aria-label={`Calificacion ${displayStars} de 5`}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    className={`h-4 w-4 ${index < displayStars ? "fill-current" : "fill-none text-slate-300"}`}
                  />
                ))}
              </div>
              {reviewCount > 0 ? (
                <span className="text-sm text-slate-500">
                  {averageRating.toFixed(1)} · {reviewCount} {reviewCount === 1 ? "reseña" : "reseñas"}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-3xl font-bold tracking-tight text-red-600">
                {formatMoney(String(retailPrice), currency)}
              </span>
              <span className="text-lg font-medium text-slate-400 line-through">
                {formatMoney(String(comparePrice), currency)}
              </span>
              {savings > 0 ? (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600">
                  {formatMoney(String(savings), currency)} OFF
                </span>
              ) : null}
            </div>

            {product.description || product.seoDescription ? (
              <p className="text-sm leading-6 text-slate-600">{product.description || product.seoDescription}</p>
            ) : (
              <p className="text-sm text-slate-500">Este producto no tiene descripcion disponible.</p>
            )}
          </div>

          <div className="space-y-3">
            {Number(product.wholesalePrice) > 0 ? (
              <p className="text-sm text-slate-600">
                Por compra mayor a <span className="font-semibold text-slate-900">{product.minWholesaleQty} unidades</span>
                {" · "}Precio exclusivo{" "}
                <span className="font-semibold text-slate-900">
                  {formatMoney(String(product.wholesalePrice), currency)}
                </span>
              </p>
            ) : null}
            <Card className="overflow-hidden rounded-2xl p-0">
              <div className="space-y-2.5 p-4">
                <Link
                  href={whatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-600 bg-white px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                >
                  <MessageCircle className="h-4 w-4" />
                  Comprar por WhatsApp
                </Link>
                <Button
                  type="button"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)]"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Comprar
                  <span className="mx-1 opacity-60">—</span>
                  <span>{formatMoney(String(retailPrice), currency)}</span>
                  <span className="text-xs font-medium text-white/70 line-through">
                    {formatMoney(String(comparePrice), currency)}
                  </span>
                </Button>
              </div>
              <div className="grid grid-cols-3 border-t border-[var(--line)] bg-[var(--primary)]/[0.06] px-2 py-2.5 text-center text-[11px] font-medium text-slate-600">
                <span>Garantia 1 año</span>
                <span className="border-x border-[var(--line)]">Envio gratis</span>
                <span>Soporte directo</span>
              </div>
            </Card>
            {product.code ? (
              <p className="text-xs text-slate-500">
                Codigo de referencia: <span className="font-medium text-slate-700">{product.code}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Detalle profesional</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {productDescription} Esta referencia forma parte del catalogo premium de {siteConfig.name}, enfocado en
          sillas, estaciones y mobiliario profesional para negocios que cuidan la experiencia del cliente y la imagen
          del espacio.
        </p>
      </div>

      {reviewCount > 0 || isAdmin ? (
        <div id="resenas" className="space-y-4 rounded-2xl border border-[var(--line)] bg-white px-5 py-4 scroll-mt-24">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Recomendaciones de clientes</h2>
            {reviewCount > 0 ? (
              <span className="flex items-center gap-1.5 text-sm text-slate-500">
                <span className="flex items-center gap-0.5 text-amber-400">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={`h-4 w-4 ${index < displayStars ? "fill-current" : "fill-none text-slate-300"}`}
                    />
                  ))}
                </span>
                {averageRating.toFixed(1)} ({reviewCount})
              </span>
            ) : null}
          </div>

          {reviewCount > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {reviews.map((review) => (
                <div key={review.id} className="flex gap-3 rounded-xl border border-[var(--line)] bg-slate-50/60 p-3">
                  {review.photoUrl ? (
                    <img
                      src={getPublicAssetUrl(review.photoUrl)}
                      alt={review.authorName ?? "Cliente"}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className={`h-3.5 w-3.5 ${index < review.rating ? "fill-current" : "fill-none text-slate-300"}`}
                        />
                      ))}
                    </div>
                    <p className="text-sm leading-5 text-slate-700">{review.comment}</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        {review.authorName ? (
                          <span className="font-semibold text-slate-900">{review.authorName}</span>
                        ) : null}
                        {review.authorName ? " · " : null}
                        {new Date(review.createdAt).toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      {isAdmin ? (
                        <form action={adminDeleteProductReviewAction}>
                          <input type="hidden" name="reviewId" value={review.id} />
                          <input type="hidden" name="returnTo" value={canonicalPath} />
                          <button type="submit" className="text-xs font-medium text-red-500 hover:text-red-600">
                            Eliminar
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aun no hay recomendaciones para este producto.</p>
          )}

          {isAdmin ? <ProductReviewForm productId={product.id} returnTo={canonicalPath} /> : null}
        </div>
      ) : null}

      {false && relatedProducts.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Productos relacionados</h2>
            <Link href="/" className="text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-strong)]">
              Ver toda la tienda
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((item) => (
              <Link key={item.id} href={buildProductPath(item)} className="group block">
                <Card className="h-full overflow-hidden rounded-xl p-0 transition group-hover:translate-y-[-2px] group-hover:shadow-[0_20px_35px_-30px_rgba(15,23,42,0.45)]">
                  <div className="relative">
                      <img
                        src={getPublicAssetUrl(item.thumbnailUrl)}
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
