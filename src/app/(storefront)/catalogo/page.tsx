import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buscarCategoriaDeTienda, generateStorefrontMetadata, StorefrontCatalog } from "@/components/store/storefront-catalog";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) || 1 : 1;
  return generateStorefrontMetadata({ query, showFullCatalog: true, page });
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  // Enlaces viejos /?category=<id> (el proxy los trae de /): se llevan a la pagina de la categoria.
  const legacyCategoryId = typeof params.category === "string" ? params.category.trim() : "";

  if (legacyCategoryId) {
    const category = await buscarCategoriaDeTienda({ id: legacyCategoryId });

    if (category) {
      redirect(`/${category.slug}`);
    }
  }

  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) || 1 : 1;

  return <StorefrontCatalog query={query} page={page} basePath="/catalogo" showFullCatalog />;
}
