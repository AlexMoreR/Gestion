import type { Metadata } from "next";
import { generateStorefrontMetadata, StorefrontCatalog } from "@/components/store/storefront-catalog";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  return generateStorefrontMetadata({ query });
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) || 1 : 1;

  return <StorefrontCatalog query={query} page={page} basePath="/catalogo" showFullCatalog />;
}
