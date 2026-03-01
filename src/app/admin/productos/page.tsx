import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { auth } from "@/auth";
import { ProductImportExportControls } from "@/components/admin/product-import-export-controls";
import { ProductsDataTable } from "@/components/admin/products-data-table";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProductosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [products, systemCurrency] = await Promise.all([
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        suppliers: {
          where: { isPreferred: true },
          include: { supplier: true },
          take: 1,
        },
      },
    }),
    getSystemCurrency(),
  ]);

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
            <Package className="h-4 w-4 text-slate-500" />
            <span>Productos</span>
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            Gestion central del catalogo con filtros, importacion y acciones rapidas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductImportExportControls />
          <Link
            href="/admin/productos/new"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
          >
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Link>
        </div>
      </div>

      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Catalogo actualizado"
        errorTitle="Error en productos"
      />

      <ProductsDataTable
        currency={systemCurrency}
        products={products.map((product) => ({
          id: product.id,
          code: product.code,
          name: product.name,
          categoryName: product.category?.name ?? null,
          supplierName: product.suppliers[0]?.supplier.name ?? null,
          thumbnailUrl: product.thumbnailUrl,
          baseCost: Number(product.baseCost),
          price: Number(product.price),
          wholesalePrice: Number(product.wholesalePrice),
          minWholesaleQty: product.minWholesaleQty,
        }))}
      />
    </section>
  );
}
