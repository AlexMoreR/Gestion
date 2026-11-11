import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { DriveImportByCodes } from "@/components/admin/drive-import-button";
import { ProductsWorkspace } from "@/components/admin/products-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getProductWorkspaceData } from "@/lib/admin-product-workspace";
import { faltanPiezasCombo } from "@/lib/combo";
import {
  getSystemCurrency,
  getSystemMinRetailMarginPct,
  getSystemMinWholesaleMarginPct,
} from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProductosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "products");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [
    { products, categories, suppliers },
    systemCurrency,
    minRetailMarginPct,
    minWholesaleMarginPct,
  ] = await Promise.all([
    getProductWorkspaceData(),
    getSystemCurrency(),
    getSystemMinRetailMarginPct(),
    getSystemMinWholesaleMarginPct(),
  ]);

  // Productos que parecen combo (CMB, "combo" o "kit") y no tienen sus piezas: se completan uno por uno.
  const combosSinPiezas = products.filter(faltanPiezasCombo);

  return (
    <section className="w-full space-y-4 overflow-x-hidden">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Catalogo actualizado"
        errorTitle="Error en productos"
      />

      {combosSinPiezas.length > 0 ? (
        <details open className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
            Combos sin piezas ({combosSinPiezas.length})
          </summary>
          <p className="mt-2 text-xs text-slate-600">
            Márcalos como combo y agrega sus piezas (mínimo 2). Mientras tanto no se pueden guardar cambios en ellos.
          </p>
          <ul className="mt-2 divide-y divide-amber-500/20">
            {combosSinPiezas.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-slate-500">{product.code ?? "sin código"}</span>{" "}
                  <span className="text-slate-800">{product.name}</span>
                </span>
                <Link
                  href={`/admin/productos/${product.id}`}
                  className="shrink-0 font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                >
                  Completar
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <DriveImportByCodes />

      <ProductsWorkspace
        currency={systemCurrency}
        minRetailMarginPct={minRetailMarginPct}
        minWholesaleMarginPct={minWholesaleMarginPct}
        okMessage={okMessage}
        categories={categories}
        suppliers={suppliers}
        products={products}
      />
    </section>
  );
}
