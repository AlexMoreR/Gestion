"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ProductStock } from "@/modules/inventory/domain/entities";

type MinStockFormDialogProps = {
  open: boolean;
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  product: ProductStock | null;
};

export function MinStockFormDialog({ open, action, onClose, returnTo, product }: MinStockFormDialogProps) {
  if (!open || !product) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Stock minimo"
      onClick={onClose}
    >
      <Card className="w-full max-w-md rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Stock minimo</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Umbral de alerta para <span className="font-medium text-foreground">{product.name}</span>.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form action={action} className="space-y-4 px-4 py-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="productId" value={product.productId} />

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Cantidad minima</span>
            <Input name="minStock" type="number" step="1" min="0" required defaultValue={product.minStock} />
            <span className="text-xs text-muted-foreground">
              Si el stock baja a este valor o menos, el producto se marca como &quot;Bajo stock&quot;. Usa 0 para desactivar.
            </span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Guardar</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
