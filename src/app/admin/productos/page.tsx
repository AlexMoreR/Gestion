import Link from "next/link";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { auth } from "@/auth";
import { adminDeleteProductAction, adminUpdateProductAction } from "@/app/actions/product-actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/currency";
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

  const [products, categories, suppliers, systemCurrency] = await Promise.all([
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        images: {
          orderBy: { order: "asc" },
        },
        suppliers: {
          where: { isPreferred: true },
          include: { supplier: true },
          take: 1,
        },
      },
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
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
          <p className="mt-0.5 text-[13px] leading-5 text-slate-600">
            Gestiona catalogo, costos, margenes y precios detallistas/mayoristas.
          </p>
        </div>
        <Link
          href="/admin/productos/new"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
        >
          Nuevo producto
        </Link>
      </div>

      {okMessage && (
        <Card className="status-success py-3">
          <p className="text-sm font-medium">{okMessage}</p>
        </Card>
      )}
      {errorMessage && (
        <Card className="status-danger py-3">
          <p className="text-sm font-medium">{errorMessage}</p>
        </Card>
      )}

      <div className="space-y-3">
        {products.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">Aun no hay productos cargados.</p>
          </Card>
        ) : (
          products.map((product) => {
            const preferredSupplier = product.suppliers[0]?.supplier ?? null;
            return (
              <Card key={product.id} className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <img
                      src={product.thumbnailUrl}
                      alt={product.name}
                      className="h-16 w-16 rounded-md border border-[var(--line)] object-cover"
                    />
                    <div>
                    <h3 className="text-sm font-semibold text-slate-900">{product.name}</h3>
                    {product.code ? (
                      <p className="text-xs font-medium text-slate-500">Codigo: {product.code}</p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      {product.category?.name || "Sin categoria"} ·{" "}
                      {preferredSupplier?.name || "Sin proveedor principal"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Costo: {formatMoney(String(product.baseCost), systemCurrency)} · Detal:{" "}
                        {formatMoney(String(product.price), systemCurrency)} · Mayor:{" "}
                        {formatMoney(String(product.wholesalePrice), systemCurrency)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Margen detal: {Number(product.retailMarginPct).toFixed(2)}% · Margen mayor:{" "}
                        {Number(product.wholesaleMarginPct).toFixed(2)}% · Min mayor: {product.minWholesaleQty}
                      </p>
                      {product.description ? (
                        <p className="mt-1 text-xs text-slate-500">{product.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <form action={adminDeleteProductAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 transition hover:bg-red-100"
                    >
                      Eliminar
                    </button>
                  </form>
                </div>

                <details className="rounded-lg border border-[var(--line)] p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Editar producto
                  </summary>
                  <form action={adminUpdateProductAction} className="mt-3 grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Codigo</span>
                      <Input name="code" defaultValue={product.code ?? ""} />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Nombre</span>
                      <Input name="name" defaultValue={product.name} required />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Costo compra ({systemCurrency})</span>
                      <Input
                        name="baseCost"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={Number(product.baseCost).toFixed(2)}
                        required
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">% Margen detal</span>
                      <Input
                        name="retailMarginPct"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={Number(product.retailMarginPct).toFixed(2)}
                        required
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">% Margen mayor</span>
                      <Input
                        name="wholesaleMarginPct"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={Number(product.wholesaleMarginPct).toFixed(2)}
                        required
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Min. unidades mayor</span>
                      <Input
                        name="minWholesaleQty"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={product.minWholesaleQty}
                        required
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-slate-700">Categoria</span>
                      <select name="categoryId" className="field-select" defaultValue={product.categoryId ?? ""}>
                        <option value="">Sin categoria</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">Proveedor principal</span>
                      <select
                        name="supplierId"
                        className="field-select"
                        defaultValue={preferredSupplier?.id ?? ""}
                      >
                        <option value="">Sin proveedor</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">Descripcion</span>
                      <textarea
                        name="description"
                        rows={3}
                        defaultValue={product.description ?? ""}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[#d1d5db80]"
                      />
                    </label>
                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">Imagenes (una URL por linea)</span>
                      <textarea
                        name="images"
                        rows={4}
                        defaultValue={product.images.map((image) => image.url).join("\n")}
                        className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[#d1d5db80]"
                        required
                      />
                    </label>
                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
                      >
                        Actualizar producto
                      </button>
                    </div>
                  </form>
                </details>
              </Card>
            );
          })
        )}
      </div>
    </section>
  );
}
