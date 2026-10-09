import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { buildProductPath } from "@/lib/product-slugs";
import { sitemapCategories, sitemapProducts } from "@/lib/seo-metadata";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        code: true,
        updatedAt: true,
        // Con la categoria, buildProductPath arma la URL canonica /<categoria>/<slug>
        // (sin ella saldria /productos/<slug>, que redirige).
        category: { select: { slug: true } },
      },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        _count: { select: { products: { where: { hiddenFromStore: false } } } },
      },
    }),
  ]);

  const indexableCategories = sitemapCategories(
    categories.map((category) => ({ ...category, activeProductCount: category._count.products })),
  );

  return [
    {
      url: getSiteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...sitemapProducts(products).map((product) => ({
      url: getSiteUrl(buildProductPath(product)),
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...indexableCategories.map((category) => ({
      url: getSiteUrl(`/${category.slug}`),
      lastModified: category.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    {
      url: getSiteUrl("/cobertura"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
