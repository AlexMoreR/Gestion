"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, Plus } from "lucide-react";
import { EditProductForm } from "@/components/admin/edit-product-form";
import { NEW_PRODUCT_DRAFT_KEY, NewProductForm } from "@/components/admin/new-product-form";
import { ProductImportExportControls } from "@/components/admin/product-import-export-controls";
import { ProductsDataTable } from "@/components/admin/products-data-table";
import type { BundleProductOption } from "@/components/admin/product-bundle-field";
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

type ProductWorkspaceRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  suppliers: Array<{
    supplierId: string;
    supplierCost: number | null;
  }>;
  isBundle: boolean;
  components: Array<{
    childId: string;
    quantity: number;
  }>;
  thumbnailUrl: string;
  imageUrls: string[];
  baseCost: number;
  retailMarginPct: number;
  wholesaleMarginPct: number;
  minWholesaleQty: number;
  price: number;
  wholesalePrice: number;
};

type ProductsWorkspaceProps = {
  products: ProductWorkspaceRow[];
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  bundleProducts: BundleProductOption[];
  currency: SupportedCurrencyCode;
  okMessage?: string;
};

export function ProductsWorkspace({
  products,
  categories,
  suppliers,
  bundleProducts,
  currency,
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
        products={products}
        onOpenProduct={openEditModal}
      />

      <Dialog open={modal === "new"} onOpenChange={(open) => (open ? null : closeModal())}>
        <DialogContent className="max-h-[92vh] w-full max-w-2xl overflow-y-auto">
          <DialogHeader>
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

      <Dialog open={modal === "edit"} onOpenChange={(open) => (open ? null : closeModal())}>
        <DialogContent className="max-h-[92vh] w-full max-w-3xl overflow-y-auto">
          {activeProduct ? (
            <>
              <DialogHeader>
                <DialogTitle>{activeProduct.name}</DialogTitle>
              </DialogHeader>
              <EditProductForm
                categories={categories}
                suppliers={suppliers}
                currency={currency}
                bundleProducts={bundleProducts.filter((product) => product.id !== activeProduct.id)}
                initialData={{
                  id: activeProduct.id,
                  code: activeProduct.code,
                  name: activeProduct.name,
                  description: activeProduct.description,
                  seoTitle: activeProduct.seoTitle,
                  seoDescription: activeProduct.seoDescription,
                  baseCost: activeProduct.baseCost,
                  price: activeProduct.price,
                  wholesalePrice: activeProduct.wholesalePrice,
                  retailMarginPct: activeProduct.retailMarginPct,
                  wholesaleMarginPct: activeProduct.wholesaleMarginPct,
                  minWholesaleQty: activeProduct.minWholesaleQty,
                  categoryId: activeProduct.categoryId,
                  isBundle: activeProduct.isBundle,
                  suppliers: activeProduct.suppliers,
                  components: activeProduct.components,
                  imageUrls: activeProduct.imageUrls,
                }}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
