"use client";

import { useEffect, useState } from "react";
import { EditProductForm } from "@/components/admin/edit-product-form";
import { getProductPurchaseHistoryAction } from "@/app/actions/inventory-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SupportedCurrencyCode } from "@/lib/currency";
import type { ProductPurchaseRow } from "@/lib/product-purchase-history";
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
  const [purchaseHistory, setPurchaseHistory] = useState<ProductPurchaseRow[]>([]);
  const [purchaseHistoryLoading, setPurchaseHistoryLoading] = useState(false);
  const productId = product?.id ?? null;

  useEffect(() => {
    if (!productId) {
      setPurchaseHistory([]);
      return;
    }
    let active = true;
    setPurchaseHistoryLoading(true);
    getProductPurchaseHistoryAction(productId)
      .then((rows) => {
        if (active) {
          setPurchaseHistory(rows);
        }
      })
      .catch(() => {
        if (active) {
          setPurchaseHistory([]);
        }
      })
      .finally(() => {
        if (active) {
          setPurchaseHistoryLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [productId]);

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
              purchaseHistory={purchaseHistory}
              purchaseHistoryLoading={purchaseHistoryLoading}
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
                minStock: product.minStock,
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
