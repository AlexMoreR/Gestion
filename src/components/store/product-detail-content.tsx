import Link from "next/link";
import { ChevronRight, CreditCard, Factory, Palette, ShieldCheck, Star, Truck } from "lucide-react";
import { adminDeleteProductReviewAction } from "@/app/actions/product-review-actions";
import { ProductFaq } from "@/components/store/product-faq";
import { ProductFichaTecnica } from "@/components/store/product-ficha-tecnica";
import { ProductGallery } from "@/components/store/product-gallery";
import { ProductReviewForm } from "@/components/store/product-review-form";
import { ProductStickyBuyBar } from "@/components/store/product-sticky-buy-bar";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { formatMoney } from "@/lib/currency";
import type { SupportedCurrencyCode } from "@/lib/currency";
import { altFicha, soloFotos } from "@/lib/product-fichas";
import { buildProductPath } from "@/lib/product-slugs";
import { imageVariantUrl } from "@/lib/image-variants";
import { buildProductLandingData, FACTORY_LOCATIONS, productDisplayName } from "@/lib/product-landing";
import { buildProductFallbackDescription, compactPriceLabel } from "@/lib/seo-metadata";
import { buildWhatsAppBuyMessage, getPublicAssetUrl, getSiteUrl, sanitizeDescription } from "@/lib/site";
import { comboSavingsFromProduct, SHIPPING_CHECK_LABEL, SHIPPING_COVERAGE_PATH } from "@/lib/storefront-offer";
import {
  getActivePromo,
  getCurrentStorePrice,
  promoInfoText,
  toBogotaDateOnly,
  type ProductPromoSource,
} from "@/lib/product-promo";
import { buildSystemWhatsAppHref, getSystemBrandName } from "@/lib/system-settings";
import { PromoPriceInfo } from "./promo-price-info";

type ProductDetailContentProps = {
  product: {
    id: string;
    slug: string;
    name: string;
    code: string | null;
    description: string | null;
    seoDescription: string | null;
    price: unknown;
    regularPrice: unknown;
    promoPrice: unknown;
    promoStartsAt: Date | null;
    promoEndsAt: Date | null;
    wholesalePrice: unknown;
    minWholesaleQty: number;
    isBundle: boolean;
    bundleComponents?: Array<{ quantity: number; child: ProductPromoSource }>;
    thumbnailUrl: string;
    categoryId: string | null;
    category: { name: string; slug: string } | null;
    images: Array<{ url: string; tipo?: string | null }>;
    reviews: Array<{
      id: string;
      authorName: string | null;
      rating: number;
      comment: string;
      photoUrl: string | null;
      createdAt: Date;
    }>;
  };
  // Fichas tecnicas (ProductImage.tipo = "ficha"): van en "Medidas y detalles", nunca en la galeria.
  fichas?: Array<{ id: string; url: string }>;
  currency: SupportedCurrencyCode;
  // Unidades en Inventario (suma de movimientos): decide InStock o MadeToOrder para Google.
  stock?: number;
  isAdmin?: boolean;
  relatedProducts: Array<{
    id: string;
    slug: string;
    name: string;
    price: unknown;
    regularPrice?: unknown;
    promoPrice?: unknown;
    promoStartsAt?: Date | string | null;
    promoEndsAt?: Date | string | null;
    thumbnailUrl: string;
    code: string | null;
    category: { name: string; slug: string } | null;
  }>;
};

// Boton principal de compra (verde WhatsApp). data-cta mide la posicion del clic
// ("principal" | "barra" | "cierre"); hoy no hay analitica cargada en la tienda.
const WHATSAPP_CTA_CLASS =
  "inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-5 text-[17px] font-extrabold text-[#0b3d22] shadow-[0_10px_24px_-12px_rgba(37,211,102,0.8)] transition hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] active:scale-[0.985]";

function Stars({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className={`${size} ${index < value ? "fill-current" : "fill-none text-slate-300"}`} />
      ))}
    </span>
  );
}

export async function ProductDetailContent({
  product,
  currency,
  relatedProducts,
  isAdmin = false,
  fichas = [],
  stock = 0,
}: ProductDetailContentProps) {
  const brandName = await getSystemBrandName();
  const reviews = product.reviews ?? [];
  const reviewCount = reviews.length;
  // Solo reseñas reales: sin reseñas no se muestran estrellas.
  const averageRating =
    reviewCount > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount : 0;
  const roundedRating = Math.round(averageRating);
  const gallery = Array.from(
    new Set(
      [product.thumbnailUrl, ...soloFotos(product.images).map((item) => item.url)]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  const canonicalPath = buildProductPath(product);
  // Precio real: el de oferta si hay una vigente (con el precio normal tachado de respaldo);
  // si no, solo el precio detal. En combos, ademas, el ahorro real frente a comprar por separado.
  const now = new Date();
  const activePromo = getActivePromo(product, now);
  const retailPrice = getCurrentStorePrice(product, now);
  const comboSavings = comboSavingsFromProduct(product, now);
  const priceText = formatMoney(String(retailPrice), currency);
  const priceLabel = compactPriceLabel(priceText);
  const categoryName = product.category?.name ?? null;
  // Sin descripcion: texto de respaldo (el mismo de la meta description), no un aviso vacio.
  const fallbackDescription = buildProductFallbackDescription({
    name: product.name,
    categoryName,
    priceLabel,
    brandName,
  });
  const productDescription = sanitizeDescription(product.seoDescription || product.description, fallbackDescription);
  const landing = buildProductLandingData({
    name: product.name,
    code: product.code,
    description: product.description || product.seoDescription,
    categoryName,
    brandName,
  });
  const leadText = landing.description || fallbackDescription;
  // El mensaje dice que viene de magilus.com, con precio y enlace de la ficha (mide ventas por SEO).
  const whatsAppHref = await buildSystemWhatsAppHref(
    buildWhatsAppBuyMessage(brandName, product.name, product.code, {
      pageUrl: getSiteUrl(canonicalPath),
      priceLabel,
    }),
  );
  // JSON-LD Product: precio real y sin reseñas ni calificaciones (aggregateRating/review).
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
    category: categoryName ?? "Mobiliario profesional",
    offers: {
      "@type": "Offer",
      url: getSiteUrl(canonicalPath),
      priceCurrency: currency,
      price: retailPrice,
      ...(activePromo ? { priceValidUntil: toBogotaDateOnly(activePromo.endsAt) } : {}),
      availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/MadeToOrder",
      seller: {
        "@type": "Organization",
        name: brandName,
      },
    },
  };

  return (
    <section className="app-page min-w-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      <nav aria-label="Ruta" className="mb-3 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="shrink-0 hover:text-foreground hover:underline">
          Inicio
        </Link>
        {product.category ? (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <Link href={`/${product.category.slug}`} className="truncate hover:text-foreground hover:underline">
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      {/* 1. Galeria + bloque de compra */}
      <div className="grid grid-cols-1 gap-5 pb-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <ProductGallery name={landing.displayName} images={gallery} />

        <div className="min-w-0 lg:sticky lg:top-20">
          {categoryName ? (
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary)]">{categoryName}</p>
          ) : null}
          <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-balance text-foreground lg:text-4xl">
            {landing.displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.code ? (
              <>
                Código <span className="font-semibold text-foreground/80">{product.code}</span> ·{" "}
              </>
            ) : null}
            Hecho por {brandName}
          </p>

          {reviewCount > 0 ? (
            <a href="#resenas" className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
              <Stars value={roundedRating} />
              <span>
                {averageRating.toFixed(1)} · {reviewCount} {reviewCount === 1 ? "reseña" : "reseñas"}
              </span>
              <span className="sr-only">Calificación {averageRating.toFixed(1)} de 5</span>
            </a>
          ) : null}

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[34px] font-extrabold leading-none tracking-tight text-foreground">{priceText}</span>
            {activePromo ? (
              <>
                <span className="text-lg font-medium text-muted-foreground line-through">
                  <span className="sr-only">Precio normal </span>
                  {formatMoney(String(activePromo.normalPrice), currency)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                  Oferta
                  <PromoPriceInfo
                    text={promoInfoText(activePromo, (value) => formatMoney(String(value), currency))}
                  />
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Precio directo de fábrica</span>
            )}
          </div>
          {comboSavings != null ? (
            <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Ahorras {formatMoney(String(comboSavings), currency)} frente a comprar por separado
            </p>
          ) : null}

          <p className="mt-3 line-clamp-4 text-[15.5px] leading-relaxed text-muted-foreground">{leadText}</p>

          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Datos clave">
            {landing.chips.map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-[var(--line)] bg-card px-3 py-1.5 text-[13px] font-semibold text-card-foreground"
              >
                {chip}
              </li>
            ))}
          </ul>

          {Number(product.wholesalePrice) > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Por compra mayor a <span className="font-semibold text-foreground">{product.minWholesaleQty} unidades</span>
              {" · "}Precio exclusivo{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(String(product.wholesalePrice), currency)}
              </span>
            </p>
          ) : null}

          <div className="mt-5">
            <a href={whatsAppHref} target="_blank" rel="noopener noreferrer" data-cta="principal" className={WHATSAPP_CTA_CLASS}>
              <WhatsAppIcon className="h-6 w-6 shrink-0 fill-current" />
              Comprar por WhatsApp
            </a>
            <p className="mt-2 text-center text-[12.5px] text-muted-foreground">
              Te responde una asesora de {brandName}. Te confirma envío, colores y tiempo de entrega.
            </p>
            <Link
              href={SHIPPING_COVERAGE_PATH}
              className="mt-2.5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-[var(--line-strong)] bg-card px-4 text-[15px] font-bold text-card-foreground transition hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              <Truck className="h-4 w-4" aria-hidden="true" />
              {SHIPPING_CHECK_LABEL}
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { title: "Fábrica", text: FACTORY_LOCATIONS },
              { title: "Garantía", text: "1 año" },
              { title: "Pago", text: "50 % y 50 %" },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-[var(--line)] bg-card px-2 py-2.5 text-xs font-semibold leading-snug text-muted-foreground"
              >
                <span className="block text-[13.5px] text-foreground">{item.title}</span>
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Medidas y detalles + colores */}
      <div className="mt-6 grid gap-6 border-t border-[var(--line)] py-7 lg:grid-cols-2 lg:gap-7">
        <div className="min-w-0">
          <h2 id="detalles" className="mb-3.5 text-[22px] font-extrabold tracking-tight text-foreground lg:text-[26px]">
            Medidas y detalles
          </h2>
          {landing.description && landing.description.length > 160 ? (
            <p className="mb-3 text-[15px] leading-relaxed text-muted-foreground">{landing.description}</p>
          ) : null}
          <dl className="overflow-hidden rounded-2xl border border-[var(--line)] bg-card text-card-foreground" aria-labelledby="detalles">
            {landing.specs.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[42%_1fr] gap-3 border-t border-[var(--line)] px-4 py-3 text-[15px] first:border-t-0"
              >
                <dt className="font-medium text-muted-foreground">{row.label}</dt>
                <dd className={row.missing ? "font-medium text-muted-foreground" : "font-semibold"}>{row.value}</dd>
              </div>
            ))}
          </dl>
          {fichas.length > 0 ? (
            <div className="mt-5">
              <h3 id="ficha-tecnica" className="mb-2.5 text-[17px] font-bold tracking-tight text-foreground">
                Ficha técnica
              </h3>
              <ProductFichaTecnica
                fichas={fichas.map((ficha, index) => ({
                  id: ficha.id,
                  src: getPublicAssetUrl(ficha.url),
                  alt: altFicha(landing.displayName, index, fichas.length),
                }))}
              />
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <h2 className="mb-3.5 text-[22px] font-extrabold tracking-tight text-foreground lg:text-[26px]">Colores</h2>
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-card p-4 text-card-foreground">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-[var(--primary)]">
              <Palette className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-[15.5px] font-bold">Elige el color con la asesora</h3>
              <p className="text-sm text-muted-foreground">
                Te enviamos por WhatsApp los colores disponibles para este modelo.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Confianza */}
      <div className="border-t border-[var(--line)] py-7">
        <h2 className="mb-3.5 text-[22px] font-extrabold tracking-tight text-foreground lg:text-[26px]">
          Compra directo de fábrica
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: Factory,
              title: `Fábrica en ${FACTORY_LOCATIONS}`,
              body: <>Lo fabricamos nosotros. Sin intermediarios.</>,
            },
            { icon: ShieldCheck, title: "Garantía", body: <>{landing.warrantyText}.</> },
            {
              icon: CreditCard,
              title: "Pagas en dos partes",
              body: <>50 % para empezar la fabricación y 50 % antes del despacho.</>,
            },
            {
              icon: Truck,
              title: "Envío a tu ciudad",
              body: (
                <>
                  <Link href={SHIPPING_COVERAGE_PATH} className="font-bold text-foreground underline underline-offset-[3px]">
                    {SHIPPING_CHECK_LABEL}
                  </Link>{" "}
                  y la asesora te confirma el valor.
                </>
              ),
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-card p-4 text-card-foreground"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-[var(--primary)]">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-[15.5px] font-bold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Como comprar */}
      <div className="border-t border-[var(--line)] py-7">
        <h2 className="mb-3.5 text-[22px] font-extrabold tracking-tight text-foreground lg:text-[26px]">
          Cómo comprar en 3 pasos
        </h2>
        <ol className="grid gap-3 lg:grid-cols-3">
          {[
            { title: "Escríbenos por WhatsApp", text: "El botón ya lleva el código y el precio de este producto." },
            { title: "Confirma color y envío", text: "La asesora te dice el color, el envío a tu ciudad y la fecha." },
            { title: "Paga el 50 % y fabricamos", text: "El otro 50 % lo pagas antes del despacho." },
          ].map((step, index) => (
            <li
              key={step.title}
              className="flex gap-3.5 rounded-2xl border border-[var(--line)] bg-card p-4 text-card-foreground"
            >
              <span
                aria-hidden="true"
                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-foreground font-extrabold text-background"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-[15.5px] font-bold">
                  <span className="sr-only">Paso {index + 1}: </span>
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* 5. Preguntas frecuentes */}
      <div className="border-t border-[var(--line)] py-7">
        <h2 className="mb-3.5 text-[22px] font-extrabold tracking-tight text-foreground lg:text-[26px]">
          Preguntas frecuentes
        </h2>
        <ProductFaq items={landing.faq} />
      </div>

      {/* Reseñas: solo reales (o el formulario para el admin) */}
      {reviewCount > 0 || isAdmin ? (
        <div id="resenas" className="scroll-mt-24 space-y-4 border-t border-[var(--line)] py-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[22px] font-extrabold tracking-tight text-foreground lg:text-[26px]">
              Recomendaciones de clientes
            </h2>
            {reviewCount > 0 ? (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Stars value={roundedRating} />
                {averageRating.toFixed(1)} ({reviewCount})
              </span>
            ) : null}
          </div>

          {reviewCount > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {reviews.map((review) => (
                <div key={review.id} className="flex gap-3 rounded-2xl border border-[var(--line)] bg-card p-3 text-card-foreground">
                  {review.photoUrl ? (
                    <img
                      src={getPublicAssetUrl(review.photoUrl)}
                      alt={review.authorName ? `Foto de ${review.authorName}` : "Foto del cliente"}
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <span className="sr-only">Calificación {review.rating} de 5</span>
                    <Stars value={review.rating} size="h-3.5 w-3.5" />
                    <p className="text-sm leading-5">{review.comment}</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {review.authorName ? (
                          <span className="font-semibold text-foreground">{review.authorName}</span>
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
            <p className="text-sm text-muted-foreground">Aun no hay recomendaciones para este producto.</p>
          )}

          {isAdmin ? <ProductReviewForm productId={product.id} returnTo={canonicalPath} /> : null}
        </div>
      ) : null}

      {/* 6. Relacionados */}
      {relatedProducts.length > 0 ? (
        <div className="border-t border-[var(--line)] py-7">
          <div className="mb-3.5 flex items-baseline justify-between gap-3">
            <h2 className="text-[22px] font-extrabold tracking-tight text-foreground lg:text-[26px]">
              También te puede gustar
            </h2>
            <Link
              href={product.category ? `/${product.category.slug}` : "/"}
              className="shrink-0 text-sm font-semibold text-[var(--primary)] hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {relatedProducts.map((item) => {
              const itemName = productDisplayName(item.name, item.category?.name);
              return (
                <Link
                  key={item.id}
                  href={buildProductPath(item)}
                  className="group block min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-card text-card-foreground transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                >
                  <img
                    src={imageVariantUrl(getPublicAssetUrl(item.thumbnailUrl), "thumb")}
                    alt={itemName}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full bg-white object-cover"
                  />
                  <div className="px-3 pb-3 pt-2.5">
                    <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{itemName}</p>
                    <p className="mt-1 text-[15px] font-bold">
                      {formatMoney(String(getCurrentStorePrice(item, now)), currency)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 7. Cierre */}
      <div className="border-t border-[var(--line)] py-7">
        <div className="grid gap-3.5 rounded-2xl bg-slate-900 px-5 py-6 text-white ring-1 ring-white/10 lg:grid-cols-[1fr_360px] lg:items-center lg:p-8">
          <div>
            <h2 className="text-[22px] font-extrabold tracking-tight lg:text-[26px]">¿Te gusta este modelo?</h2>
            <p className="mt-1 text-white/80">
              Escríbenos por {landing.displayName}
              {product.code ? ` (${product.code})` : ""} y una asesora te ayuda con el color y el envío a tu ciudad.
            </p>
          </div>
          <a href={whatsAppHref} target="_blank" rel="noopener noreferrer" data-cta="cierre" className={WHATSAPP_CTA_CLASS}>
            <WhatsAppIcon className="h-6 w-6 shrink-0 fill-current" />
            Comprar por WhatsApp
          </a>
        </div>
      </div>

      <ProductStickyBuyBar
        whatsAppHref={whatsAppHref}
        priceText={priceText}
        code={product.code}
        displayName={landing.displayName}
      />
    </section>
  );
}
