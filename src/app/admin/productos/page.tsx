import Link from "next/link";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { auth } from "@/auth";
import { ProductImportExportControls } from "@/components/admin/product-import-export-controls";
import { ProductsDataTable } from "@/components/admin/products-data-table";
import { Card } from "@/components/ui/card";
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
    <section className="w-full space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
            <Package className="h-4 w-4 text-slate-500" />
            <span>Productos</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductImportExportControls />
          <Link
            href="/admin/productos/new"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--primary)] px-3 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
          >
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

      <Card className="p-4 md:p-5">
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
      </Card>
    </section>
  );
}
