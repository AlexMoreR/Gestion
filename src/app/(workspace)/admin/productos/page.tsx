import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProductsWorkspace } from "@/components/admin/products-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getProductWorkspaceData } from "@/lib/admin-product-workspace";
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
  if (session?.user?.role !== "ADMIN") {
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
    { products, categories, suppliers, bundleProducts },
    systemCurrency,
    minRetailMarginPct,
    minWholesaleMarginPct,
  ] = await Promise.all([
    getProductWorkspaceData(),
    getSystemCurrency(),
    getSystemMinRetailMarginPct(),
    getSystemMinWholesaleMarginPct(),
  ]);

  return (
    <section className="w-full space-y-4 overflow-x-hidden">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Catalogo actualizado"
        errorTitle="Error en productos"
      />

      <ProductsWorkspace
        currency={systemCurrency}
        minRetailMarginPct={minRetailMarginPct}
        minWholesaleMarginPct={minWholesaleMarginPct}
        okMessage={okMessage}
        bundleProducts={bundleProducts}
        categories={categories}
        suppliers={suppliers}
        products={products}
      />
    </section>
  );
}
