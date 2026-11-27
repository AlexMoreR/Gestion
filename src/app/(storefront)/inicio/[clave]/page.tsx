import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateStorefrontMetadata, StorefrontCatalog } from "@/components/store/storefront-catalog";

// El inicio (magilus.com/). src/proxy.ts lo sirve en "/" reescribiendo a /inicio/portada y manda
// las busquedas (?q, ?page, ?category) a /catalogo. No lee la URL: va en cache (ISR) y se rehace
// cada 5 min. Vive en un segmento dinamico, como las fichas, para que el build no lo arme
// (el build no tiene base de datos).
export const revalidate = 300;

export function generateStaticParams(): Array<{ clave: string }> {
  return [];
}

type PageProps = {
  params: Promise<{ clave: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return generateStorefrontMetadata({});
}

export default async function HomePage({ params }: PageProps) {
  const { clave } = await params;
  // Una sola entrada en cache: cualquier otra clave no existe.
  if (clave !== "portada") notFound();

  return <StorefrontCatalog query="" page={1} basePath="/" />;
}
