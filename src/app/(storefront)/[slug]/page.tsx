import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buscarCategoriaDeTienda, StorefrontCatalog, generateStorefrontMetadata } from "@/components/store/storefront-catalog";

// Lee ?page, asi que Next la arma en cada visita; sus datos salen de la cache de 5 min.
export const revalidate = 300;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const reservedSlugs = new Set(["favicon.ico", "robots.txt", "sitemap.xml"]);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (reservedSlugs.has(slug)) {
    return {};
  }
  return generateStorefrontMetadata({ categorySlug: slug });
}

export default async function CategorySlugPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  if (reservedSlugs.has(slug)) {
    notFound();
  }
  const category = await buscarCategoriaDeTienda({ slug });

  if (!category) {
    notFound();
  }

  const sp = await searchParams;
  const page = typeof sp.page === "string" ? Number.parseInt(sp.page, 10) || 1 : 1;

  return <StorefrontCatalog categorySlug={slug} page={page} />;
}
