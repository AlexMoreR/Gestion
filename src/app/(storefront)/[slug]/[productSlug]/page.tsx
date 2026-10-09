import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { auth } from "@/auth";
import { ProductDetailContent } from "@/components/store/product-detail-content";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getCurrentStorePrice } from "@/lib/product-promo";
import { buildProductPath } from "@/lib/product-slugs";
import { buildProductSeoTitle, compactPriceLabel, truncateMetaDescription } from "@/lib/seo-metadata";
import { getPublicAssetUrl, getSiteUrl, sanitizeDescription, siteConfig } from "@/lib/site";
import { COMBO_SAVINGS_COMPONENTS_SELECT } from "@/lib/storefront-offer";
import { getSystemBrandName, getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ slug: string; productSlug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
    include: { category: true },
  });

  if (!product || product.category?.slug !== slug) {
    return {
      title: "Producto no encontrado",
      robots: { index: false, follow: false },
    };
  }

  const [currency, brandName] = await Promise.all([getSystemCurrency(), getSystemBrandName()]);
  // Si el admin cargo seoDescription se respeta tal cual; si no, se recorta a ~155 car.
  const seoDescription = product.seoDescription?.trim();
  const description = seoDescription
    ? sanitizeDescription(seoDescription, "")
    : truncateMetaDescription(
        sanitizeDescription(
          product.description,
          `${product.name} ${product.category?.name ? `de ${product.category.name} ` : ""}disponible en ${siteConfig.name}, mobiliario profesional premium para salon y barberia.`,
        ),
      );
  const canonicalPath = buildProductPath(product);
  const canonical = getSiteUrl(canonicalPath);
  const imageUrl = getPublicAssetUrl(product.thumbnailUrl);
  // Si hay seoTitle se respeta (el layout le agrega "| Marca"). Si no:
  // "<Nombre> | $<precio vigente> | Marca" (mismo precio que muestra la ficha).
  const seoTitle = product.seoTitle?.trim();
  const fullTitle = seoTitle
    ? `${seoTitle} | ${brandName}`
    : buildProductSeoTitle({
        name: product.name,
        priceLabel: compactPriceLabel(formatMoney(String(getCurrentStorePrice(product)), currency)),
        brandName,
      });

  return {
    title: seoTitle || { absolute: fullTitle },
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
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
  const [product, currency, session] = await Promise.all([
    prisma.product.findUnique({
      where: { slug: productSlug },
      include: {
        category: true,
        images: { orderBy: { order: "asc" } },
        reviews: { orderBy: { createdAt: "desc" } },
        bundleComponents: COMBO_SAVINGS_COMPONENTS_SELECT,
      },
    }),
    getSystemCurrency(),
    auth(),
  ]);

  if (!product) {
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
      ...(product.categoryId ? { categoryId: product.categoryId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 4,
    include: { category: true },
  });

  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <ProductDetailContent
      product={product}
      currency={currency}
      relatedProducts={relatedProducts}
      isAdmin={isAdmin}
    />
  );
}
