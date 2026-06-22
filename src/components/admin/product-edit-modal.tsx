"use client";

import { EditProductForm } from "@/components/admin/edit-product-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SupportedCurrencyCode } from "@/lib/currency";
import type {
  BundleProductOption,
  ProductWorkspaceOption,
  ProductWorkspaceRow,
} from "@/lib/admin-product-workspace";

type ProductEditModalProps = {
  product: ProductWorkspaceRow | null;
  categories: ProductWorkspaceOption[];
  suppliers: ProductWorkspaceOption[];
  bundleProducts: BundleProductOption[];
  currency: SupportedCurrencyCode;
  onClose: () => void;
};

export function ProductEditModal({
  product,
  categories,
  suppliers,
  bundleProducts,
  currency,
  onClose,
}: ProductEditModalProps) {
  return (
    <Dialog open={product !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        {product ? (
          <>
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
            </DialogHeader>
            <EditProductForm
              categories={categories}
              suppliers={suppliers}
              currency={currency}
              bundleProducts={bundleProducts.filter((item) => item.id !== product.id)}
              initialData={{
                id: product.id,
                code: product.code,
                name: product.name,
                description: product.description,
                seoTitle: product.seoTitle,
                seoDescription: product.seoDescription,
                baseCost: product.baseCost,
                price: product.price,
                wholesalePrice: product.wholesalePrice,
                retailMarginPct: product.retailMarginPct,
                wholesaleMarginPct: product.wholesaleMarginPct,
                minWholesaleQty: product.minWholesaleQty,
                categoryId: product.categoryId,
                isBundle: product.isBundle,
                suppliers: product.suppliers,
                components: product.components,
                imageUrls: product.imageUrls,
              }}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
