import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buscarCategoriaDeTienda, generateStorefrontMetadata, StorefrontCatalog } from "@/components/store/storefront-catalog";

// Lee ?q y ?page, asi que Next la arma en cada visita; sus datos salen de la cache de 5 min.
export const revalidate = 300;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  return generateStorefrontMetadata({ query });
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const legacyCategoryId = typeof params.category === "string" ? params.category.trim() : "";

  if (legacyCategoryId) {
    const category = await buscarCategoriaDeTienda({ id: legacyCategoryId });

    if (category) {
      redirect(`/${category.slug}`);
    }
  }

  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) || 1 : 1;

  return <StorefrontCatalog query={query} page={page} basePath="/" />;
}
