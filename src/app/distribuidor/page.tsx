import type { Metadata } from "next";
import Image from "next/image";
import { Store } from "lucide-react";
import { WholesaleCatalog, type WholesaleProduct } from "@/components/store/wholesale-catalog";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import {
  getSystemBrandName,
  getSystemCurrency,
  getSystemStorefrontLogoPath,
} from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  return {
    title: `Precios al por mayor | ${brandName}`,
    description: `Lista de precios al por mayor de ${brandName}.`,
    robots: { index: false, follow: false },
  };
}

export default async function WholesalePublicPage() {
  const [rows, brandName, currency, logoPath] = await Promise.all([
    prisma.product.findMany({
      where: { wholesalePrice: { gt: 0 } },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        thumbnailUrl: true,
        wholesalePrice: true,
        minWholesaleQty: true,
        category: { select: { name: true } },
      },
    }),
    getSystemBrandName(),
    getSystemCurrency(),
    getSystemStorefrontLogoPath(),
  ]);

  const products: WholesaleProduct[] = rows.map((product) => ({
    id: product.id,
    name: product.name,
    code: product.code,
    categoryName: product.category?.name ?? null,
    thumbnailUrl: getPublicAssetUrl(product.thumbnailUrl),
    wholesalePrice: Number(product.wholesalePrice),
    minWholesaleQty: product.minWholesaleQty,
  }));

  const categories = Array.from(
    new Set(products.map((product) => product.categoryName ?? "Sin categoria")),
  ).sort((a, b) => a.localeCompare(b, "es"));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 md:px-6">
          <Image
            src={getPublicAssetUrl(logoPath)}
            alt={brandName}
            width={140}
            height={48}
            className="h-9 w-auto object-contain"
            unoptimized
          />
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
            <Store className="h-3.5 w-3.5" />
            Precios al por mayor
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        <WholesaleCatalog products={products} categories={categories} currency={currency} />
      </main>
    </div>
  );
}
