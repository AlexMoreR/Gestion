"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ProductOption = {
  id: string;
  name: string;
  code: string | null;
  stock: number;
};

type InventoryMovementFormDialogProps = {
  open: boolean;
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  products: ProductOption[];
  initialProductId?: string | null;
};

type MovementType = "IN" | "OUT" | "ADJUSTMENT";

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const QUANTITY_LABEL: Record<MovementType, string> = {
  IN: "Cantidad a ingresar",
  OUT: "Cantidad a retirar",
  ADJUSTMENT: "Conteo real (total)",
};

const QUANTITY_HINT: Record<MovementType, string> = {
  IN: "Se sumara al stock actual.",
  OUT: "Se restara del stock actual.",
  ADJUSTMENT: "Fija el stock al numero contado; se registra la diferencia.",
};

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function InventoryMovementFormDialog({
  open,
  action,
  onClose,
  returnTo,
  products,
  initialProductId,
}: InventoryMovementFormDialogProps) {
  const [productId, setProductId] = React.useState(initialProductId ?? "");
  const [type, setType] = React.useState<MovementType>("IN");

  // Sincroniza el producto preseleccionado cada vez que se abre el dialogo.
  React.useEffect(() => {
    if (open) {
      setProductId(initialProductId ?? "");
      setType("IN");
    }
  }, [open, initialProductId]);

  if (!open) {
    return null;
  }

  const hasProducts = products.length > 0;
  const selectedProduct = products.find((product) => product.id === productId) ?? null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Movimiento de inventario"
      onClick={onClose}
    >
      <Card className="w-full max-w-lg rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Movimiento de inventario</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Registra una entrada, salida o ajuste de stock.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!hasProducts ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            <p>No hay productos tipo Stock. Crea uno o cambia el modo de cumplimiento de un producto a &quot;Stock&quot;.</p>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Entendido
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-4 px-4 py-4">
            <input type="hidden" name="returnTo" value={returnTo} />

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Producto</span>
              <select
                name="productId"
                required
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                className={cn(controlClassName, "appearance-none")}
              >
                <option value="" disabled>
                  Selecciona un producto
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                    {product.code ? ` (${product.code})` : ""}
                  </option>
                ))}
              </select>
              {selectedProduct ? (
                <span className="text-xs text-muted-foreground">Stock actual: {selectedProduct.stock}</span>
              ) : null}
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Tipo</span>
                <select
                  name="type"
                  value={type}
                  onChange={(event) => setType(event.target.value as MovementType)}
                  className={cn(controlClassName, "appearance-none")}
                >
                  <option value="IN">Entrada (sumar)</option>
                  <option value="OUT">Salida (restar)</option>
                  <option value="ADJUSTMENT">Ajuste (conteo)</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">{QUANTITY_LABEL[type]}</span>
                <Input name="quantity" type="number" step="1" min="0" required placeholder="0" />
                <span className="text-xs text-muted-foreground">{QUANTITY_HINT[type]}</span>
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Fecha</span>
              <Input name="movementDate" type="date" required defaultValue={today()} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nota (opcional)</span>
              <textarea
                name="note"
                rows={2}
                className={cn(controlClassName, "h-auto resize-none py-2")}
                placeholder="Ej. Compra a proveedor, merma, conteo fisico"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">Registrar movimiento</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
