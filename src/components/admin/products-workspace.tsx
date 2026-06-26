"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, Plus } from "lucide-react";
import { NEW_PRODUCT_DRAFT_KEY, NewProductForm } from "@/components/admin/new-product-form";
import { ProductEditModal } from "@/components/admin/product-edit-modal";
import { ProductImportExportControls } from "@/components/admin/product-import-export-controls";
import { ProductsDataTable } from "@/components/admin/products-data-table";
import type { BundleProductOption } from "@/components/admin/product-bundle-field";
import type { ProductWorkspaceRow } from "@/lib/admin-product-workspace";
import type { SupportedCurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { buttonVariants } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CategoryOption = {
  id: string;
  name: string;
};

type SupplierOption = {
  id: string;
  name: string;
};

type ProductsWorkspaceProps = {
  products: ProductWorkspaceRow[];
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  bundleProducts: BundleProductOption[];
  currency: SupportedCurrencyCode;
  minRetailMarginPct?: number;
  minWholesaleMarginPct?: number;
  okMessage?: string;
};

export function ProductsWorkspace({
  products,
  categories,
  suppliers,
  bundleProducts,
  currency,
  minRetailMarginPct,
  minWholesaleMarginPct,
  okMessage,
}: ProductsWorkspaceProps) {
  const [modal, setModal] = useState<"edit" | "new" | null>(null);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);

  const activeProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? null,
    [products, activeProductId],
  );

  const openEditModal = (productId: string) => {
    setActiveProductId(productId);
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setActiveProductId(null);
  };

  useEffect(() => {
    if (okMessage?.includes("Producto creado")) {
      window.localStorage.removeItem(NEW_PRODUCT_DRAFT_KEY);
    }
  }, [okMessage]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
            <Package className="h-4 w-4 text-slate-500" />
            <span>Productos</span>
          </h1>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <ProductImportExportControls />
          <button
            type="button"
            onClick={() => setModal("new")}
            className={cn(buttonVariants(), "flex-1 sm:flex-none")}
          >
            <Plus className="h-4 w-4" />
            Nuevo producto
          </button>
        </div>
      </div>

      <ProductsDataTable
        currency={currency}
        minRetailMarginPct={minRetailMarginPct}
        minWholesaleMarginPct={minWholesaleMarginPct}
        products={products}
        onOpenProduct={openEditModal}
      />

      <Dialog open={modal === "new"} onOpenChange={(open) => (open ? null : closeModal())}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="inline-flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-500" />
              Nuevo producto
            </DialogTitle>
          </DialogHeader>
          <NewProductForm
            categories={categories}
            suppliers={suppliers}
            currency={currency}
            bundleProducts={bundleProducts}
            onCancel={closeModal}
          />
        </DialogContent>
      </Dialog>

      <ProductEditModal
        product={activeProduct}
        categories={categories}
        suppliers={suppliers}
        bundleProducts={bundleProducts}
        currency={currency}
        onClose={closeModal}
      />
    </>
  );
}
