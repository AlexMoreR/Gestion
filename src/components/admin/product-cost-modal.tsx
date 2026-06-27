"use client";

import { useEffect, useState } from "react";
import { Pencil, Wallet, Truck, Tag, TrendingUp, PackageSearch, ArrowUpRight } from "lucide-react";
import { getProductPurchaseHistoryAction } from "@/app/actions/inventory-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { ProductPurchaseRow } from "@/lib/product-purchase-history";
import type { ProductStock } from "@/modules/inventory/domain/entities";

type ProductCostModalProps = {
  product: ProductStock | null;
  currency: SupportedCurrencyCode;
  onClose: () => void;
  onEdit: (productId: string) => void;
};

function Row({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; tone?: "neutral" | "muted" | "strong" | "success" }) {
  const valueClass =
    tone === "strong"
      ? "text-base font-semibold text-foreground"
      : tone === "success"
        ? "text-base font-semibold text-emerald-600 dark:text-emerald-400"
        : tone === "muted"
          ? "text-sm text-muted-foreground"
          : "text-sm font-medium text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

export function ProductCostModal({ product, currency, onClose, onEdit }: ProductCostModalProps) {
  const [origin, setOrigin] = useState<ProductPurchaseRow | null>(null);
  const productId = product?.productId ?? null;

  useEffect(() => {
    if (!productId) {
      setOrigin(null);
      return;
    }
    let active = true;
    getProductPurchaseHistoryAction(productId)
      .then((rows) => {
        if (active) setOrigin(rows[0] ?? null);
      })
      .catch(() => {
        if (active) setOrigin(null);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  const supplierCost = product ? product.baseCost : 0;
  const freight = product ? product.additionalCost : 0;
  const totalCost = supplierCost + freight;
  const price = product ? product.price : 0;
  const profit = price - totalCost;
  const marginPct = price > 0 ? (profit / price) * 100 : 0;

  return (
    <Dialog open={product !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="w-full max-w-md">
        {product ? (
          <>
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
              {product.code ? <p className="text-xs text-muted-foreground">{product.code}</p> : null}
            </DialogHeader>

            <div className="space-y-4">
              {/* Costo de compra */}
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Costo de compra</p>
                <Row icon={<Wallet className="h-4 w-4" />} label="Precio compra proveedor" value={formatMoney(supplierCost, currency)} />
                <Row icon={<Truck className="h-4 w-4" />} label="Flete / costo adicional" value={`+ ${formatMoney(freight, currency)}`} />
                <div className="my-1 border-t border-border" />
                <Row icon={<PackageSearch className="h-4 w-4" />} label="Costo de compra total" value={formatMoney(totalCost, currency)} tone="strong" />
              </div>

              {/* Venta y rentabilidad */}
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Venta</p>
                <Row icon={<Tag className="h-4 w-4" />} label="Precio de venta" value={formatMoney(price, currency)} tone="strong" />
                <Row icon={<TrendingUp className="h-4 w-4" />} label="Ganancia" value={formatMoney(profit, currency)} tone="success" />
                <Row icon={<TrendingUp className="h-4 w-4" />} label="% de venta (margen)" value={`${marginPct.toFixed(1)}%`} tone="success" />
              </div>

              {/* Origen */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span className="text-sm text-muted-foreground">Orden de origen</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                  {origin?.orderCode ?? origin?.purchaseCode ?? "—"}
                  {origin?.purchaseCode && origin?.orderCode ? (
                    <span className="text-xs text-muted-foreground">· {origin.purchaseCode}</span>
                  ) : null}
                </span>
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button type="button" onClick={() => onEdit(product.productId)}>
                <Pencil className="mr-1.5 h-4 w-4" />
                Editar producto
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
