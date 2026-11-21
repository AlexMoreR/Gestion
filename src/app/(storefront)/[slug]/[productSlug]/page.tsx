import type { Metadata } from "next";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductDetailContent } from "@/components/store/product-detail-content";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { separarImagenes } from "@/lib/product-fichas";
import { getCurrentStorePrice } from "@/lib/product-promo";
import { readableDescription } from "@/lib/product-landing";
import { findRedirectTarget } from "@/lib/product-redirect";
import { buildProductPath } from "@/lib/product-slugs";
import { getProductSeoContent } from "@/lib/product-seo-content";
import {
  buildProductFallbackDescription,
  buildProductSeoTitle,
  compactPriceLabel,
  truncateMetaDescription,
} from "@/lib/seo-metadata";
import { getPublicAssetUrl, getSiteUrl, sanitizeDescription, siteConfig } from "@/lib/site";
import { COMBO_SAVINGS_COMPONENTS_SELECT } from "@/lib/storefront-offer";
import { getSystemBrandName, getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ slug: string; productSlug: string }>;
};

// Ficha en cache (ISR): se arma en su primera visita y se guarda 5 min; al editar se refresca
// con refrescarTienda(). El build no arma ninguna (no necesita la base).
export const revalidate = 300;

export function generateStaticParams(): Array<{ slug: string; productSlug: string }> {
  return [];
}

// Una sola consulta por visita: generateMetadata y la pagina comparten el resultado (React cache).
const getProductBySlug = cache((productSlug: string) =>
  prisma.product.findUnique({
    where: { slug: productSlug },
    include: {
      category: true,
      // Fotos y fichas tecnicas juntas; se separan abajo (las fichas nunca van a la galeria).
      images: { orderBy: { order: "asc" } },
      reviews: { orderBy: { createdAt: "desc" } },
      bundleComponents: COMBO_SAVINGS_COMPONENTS_SELECT,
    },
  }),
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const product = await getProductBySlug(productSlug);

  // Los productos ocultos en la tienda se tratan como inexistentes (no se exponen).
  if (!product || product.hiddenFromStore || product.category?.slug !== slug) {
    return {
      title: "Producto no encontrado",
      robots: { index: false, follow: false },
    };
  }

  const [currency, brandName] = await Promise.all([getSystemCurrency(), getSystemBrandName()]);
  const priceLabel = compactPriceLabel(formatMoney(String(getCurrentStorePrice(product)), currency));
  // Si el admin cargo seoDescription se respeta tal cual; si no, se recorta a ~155 car.
  // Sin descripcion: texto de respaldo con categoria, fabrica, precio y WhatsApp.
  // Texto fijo en código para esta ficha (gana sobre lo del admin).
  const fixedSeo = getProductSeoContent(product.slug);
  const seoDescription = fixedSeo?.description ?? product.seoDescription?.trim();
  const description = seoDescription
    ? sanitizeDescription(seoDescription, "")
    : truncateMetaDescription(
        sanitizeDescription(
          // Si viene en MAYUSCULAS sale en letra normal, igual que en la ficha visible.
          readableDescription(product.description),
          buildProductFallbackDescription({
            name: product.name,
            categoryName: product.category?.name,
            priceLabel,
            brandName,
          }),
        ),
      );
  const canonicalPath = buildProductPath(product);
  const canonical = getSiteUrl(canonicalPath);
  const imageUrl = getPublicAssetUrl(product.thumbnailUrl);
  // Si hay seoTitle se respeta (el layout le agrega "| Marca"). Si no:
  // "<Nombre> | $<precio vigente> | Marca" (mismo precio que muestra la ficha).
  const seoTitle = fixedSeo?.title ?? product.seoTitle?.trim();
  const fullTitle = seoTitle
    ? `${seoTitle} | ${brandName}`
    : buildProductSeoTitle({
        name: product.name,
        categoryName: product.category?.name,
        priceLabel,
        brandName,
      });

  return {
    title: seoTitle || { absolute: fullTitle },
    description,
    alternates: {
      canonical,
    },
    // Next reemplaza todo el openGraph del layout: repetir marca e idioma para la vista previa.
    openGraph: {
      type: "website",
      siteName: brandName,
      locale: siteConfig.locale,
      url: canonical,
      title: fullTitle,
      description,
      images: [
        {
          url: imageUrl,
          alt: product.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [imageUrl],
    },
  };
}

export default async function CategoryProductPage({ params }: PageProps) {
  const { slug, productSlug } = await params;
  const [product, currency] = await Promise.all([getProductBySlug(productSlug), getSystemCurrency()]);

  // Oculto en la tienda: 404 aunque llegue con su slug exacto (y nunca se redirige a el).
  if (product?.hiddenFromStore) {
    notFound();
  }

  if (!product) {
    // Enlace viejo: solo si hay un unico producto visible por codigo o sufijo exacto -> 308.
    const redirectTarget = await findRedirectTarget(productSlug);
    if (redirectTarget) {
      permanentRedirect(redirectTarget);
    }
    notFound();
  }

  if (!product.category) {
    permanentRedirect(buildProductPath(product));
  }

  if (product.category.slug !== slug) {
    permanentRedirect(buildProductPath(product));
  }

  const relatedProducts = await prisma.product.findMany({
    where: {
      id: { not: product.id },
      hiddenFromStore: false,
      ...(product.categoryId ? { categoryId: product.categoryId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 4,
    include: { category: true },
  });

  const { fotos, fichas: todasLasFichas } = separarImagenes(product.images);
  // Las fichas traen marca de agua del proveedor: por ahora solo las ven los admin (decision 28-oct).
  // FICHAS_EN_TIENDA=true las muestra a todos; si no, el HTML no lleva ninguna y el admin las pide
  // desde el navegador (FichasAdmin), asi la pagina no depende de quien la mira.
  const fichas = process.env.FICHAS_EN_TIENDA === "true" ? todasLasFichas : [];

  return (
    <ProductDetailContent
      product={{ ...product, images: fotos }}
      fichas={fichas.map((ficha) => ({ id: ficha.id, url: ficha.url }))}
      currency={currency}
      relatedProducts={relatedProducts}
    />
  );
}
