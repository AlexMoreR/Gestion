"use client";

import * as React from "react";
import { ProductSearchSelect } from "@/components/admin/product-search-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

type ProductOption = {
  id: string;
  name: string;
  code: string | null;
  stock: number;
};

type SupplierOption = {
  id: string;
  name: string;
  cost: number | null;
};

type ComboComponentOption = {
  childId: string;
  name: string;
  code: string | null;
  quantity: number;
};

type InventoryMovementFormDialogProps = {
  open: boolean;
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  products: ProductOption[];
  comboComponents: Record<string, ComboComponentOption[]>;
  suppliersByProduct: Record<string, SupplierOption[]>;
  suppliers: { id: string; name: string }[];
  initialProductId?: string | null;
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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
  comboComponents,
  suppliersByProduct,
  suppliers,
  initialProductId,
}: InventoryMovementFormDialogProps) {
  const [productId, setProductId] = React.useState(initialProductId ?? "");
  const [quantity, setQuantity] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [purchaseCost, setPurchaseCost] = React.useState("");
  const [extraConcept, setExtraConcept] = React.useState("");
  const [extraSupplierId, setExtraSupplierId] = React.useState("");
  const [extraCost, setExtraCost] = React.useState("");
  // Combo: proveedor y costo por cada componente.
  const [componentCharges, setComponentCharges] = React.useState<
    Record<string, { supplierId: string; cost: string }>
  >({});
  // Combo: componentes que el usuario quito de la lista.
  const [removedComponents, setRemovedComponents] = React.useState<Record<string, boolean>>({});

  const supplierOptions = productId ? suppliersByProduct[productId] ?? [] : [];
  const allComboParts = productId ? comboComponents[productId] ?? null : null;
  const comboParts = allComboParts
    ? allComboParts.filter((part) => !removedComponents[part.childId])
    : null;
  const isCombo = Boolean(comboParts && comboParts.length > 0);

  const componentChargesJson = JSON.stringify(
    (comboParts ?? []).map((part) => ({
      childId: part.childId,
      supplierId: componentCharges[part.childId]?.supplierId ?? "",
      cost: Number(componentCharges[part.childId]?.cost || 0) || 0,
    })),
  );

  // Costo unitario: suma de componentes del combo o el costo de compra del producto.
  const unitCost = isCombo
    ? (comboParts ?? []).reduce(
        (sum, part) => sum + (Number(componentCharges[part.childId]?.cost || 0) || 0),
        0,
      )
    : Number(purchaseCost || 0) || 0;
  const quantityValue = Number(quantity || 0) || 0;
  const totalToPay = unitCost * quantityValue + (Number(extraCost || 0) || 0);

  // Al cambiar de producto, limpia el proveedor elegido (cada producto tiene los suyos).
  const handleProductChange = (nextProductId: string) => {
    setProductId(nextProductId);
    setQuantity("");
    setSupplierId("");
    setPurchaseCost("");
    setComponentCharges({});
    setRemovedComponents({});
  };

  // Al elegir proveedor, autocompleta el costo con el costo de ese proveedor.
  const handleSupplierChange = (nextSupplierId: string) => {
    setSupplierId(nextSupplierId);
    const supplier = (suppliersByProduct[productId] ?? []).find((s) => s.id === nextSupplierId);
    if (supplier && supplier.cost !== null) {
      setPurchaseCost(String(Math.round(supplier.cost)));
    }
  };

  // Sincroniza el producto preseleccionado cada vez que se abre el dialogo.
  React.useEffect(() => {
    if (open) {
      setProductId(initialProductId ?? "");
      setComponentCharges({});
      setRemovedComponents({});
    }
  }, [open, initialProductId]);

  const hasProducts = products.length > 0;

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? null : onClose())}>
      <DialogContent className="flex max-h-[88vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Nuevo Inventario</DialogTitle>
        </DialogHeader>

        {!hasProducts ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            <p>No hay productos tipo Stock. Crea uno o cambia el modo de cumplimiento de un producto a &quot;Stock&quot;.</p>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Entendido
              </Button>
            </div>
          </div>
        ) : (
          <>
          <form id="inventory-movement-form" action={action} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <input type="hidden" name="returnTo" value={returnTo} />

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Producto</span>
              <ProductSearchSelect
                products={products}
                value={productId}
                onChange={handleProductChange}
              />
              <input type="hidden" name="productId" value={productId} />
            </label>

            <input type="hidden" name="type" value="IN" />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Cantidad</span>
                <Input
                  name="quantity"
                  type="number"
                  step="1"
                  min="0"
                  required
                  placeholder="0"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Fecha</span>
                <DatePicker name="movementDate" required defaultValue={today()} />
              </label>
            </div>

            {isCombo ? <input type="hidden" name="componentCharges" value={componentChargesJson} /> : null}

            {isCombo ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="space-y-2.5">
                  {(comboParts ?? []).map((part) => {
                    const partSuppliers = suppliersByProduct[part.childId]?.length
                      ? suppliersByProduct[part.childId]
                      : suppliers.map((supplier) => ({ ...supplier, cost: null }));
                    const entry = componentCharges[part.childId] ?? { supplierId: "", cost: "" };
                    return (
                      <div key={part.childId} className="grid items-end gap-2 sm:grid-cols-[1fr_minmax(0,9rem)_minmax(0,7rem)_auto]">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{part.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {part.code ? `${part.code} · ` : ""}x{part.quantity}
                          </p>
                        </div>
                        <select
                          value={entry.supplierId}
                          onChange={(event) => {
                            const supplierIdValue = event.target.value;
                            const found = partSuppliers.find((supplier) => supplier.id === supplierIdValue);
                            setComponentCharges((current) => ({
                              ...current,
                              [part.childId]: {
                                supplierId: supplierIdValue,
                                cost:
                                  found && found.cost !== null
                                    ? String(Math.round(found.cost))
                                    : current[part.childId]?.cost ?? "",
                              },
                            }));
                          }}
                          className={cn(controlClassName, "appearance-none")}
                        >
                          <option value="">Sin proveedor</option>
                          {partSuppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                        <Input
                          inputMode="numeric"
                          value={entry.cost ? Number(entry.cost).toLocaleString("es-CO") : ""}
                          onChange={(event) => {
                            const cost = event.target.value.replace(/\D/g, "");
                            setComponentCharges((current) => ({
                              ...current,
                              [part.childId]: { supplierId: current[part.childId]?.supplierId ?? "", cost },
                            }));
                          }}
                          placeholder="Precio"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRemovedComponents((current) => ({ ...current, [part.childId]: true }))
                          }
                          aria-label={`Quitar ${part.name}`}
                          title="Quitar producto"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!isCombo ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Proveedor (opcional)</span>
                  <select
                    name="supplierId"
                    value={supplierId}
                    onChange={(event) => handleSupplierChange(event.target.value)}
                    disabled={!productId || supplierOptions.length === 0}
                    className={cn(controlClassName, "appearance-none disabled:cursor-not-allowed disabled:opacity-50")}
                  >
                    <option value="">
                      {!productId
                        ? "Elige un producto primero"
                        : supplierOptions.length === 0
                          ? "Sin proveedores para este producto"
                          : "Sin proveedor"}
                    </option>
                    {supplierOptions.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Costo de compra</span>
                  <Input
                    inputMode="numeric"
                    value={purchaseCost ? Number(purchaseCost).toLocaleString("es-CO") : ""}
                    onChange={(event) => setPurchaseCost(event.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                  />
                  <input type="hidden" name="purchaseCost" value={purchaseCost} />
                </label>
              </div>
            ) : null}

            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <span className="text-sm font-medium text-foreground">Costo adicional</span>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Concepto</span>
                    <Input
                      name="extraConcept"
                      value={extraConcept}
                      onChange={(event) => setExtraConcept(event.target.value)}
                      placeholder="Ej. Transporte"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Proveedor</span>
                    <select
                      name="extraSupplierId"
                      value={extraSupplierId}
                      onChange={(event) => setExtraSupplierId(event.target.value)}
                      className={cn(controlClassName, "appearance-none")}
                    >
                      <option value="">Sin proveedor</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Monto</span>
                    <Input
                      inputMode="numeric"
                      value={extraCost ? Number(extraCost).toLocaleString("es-CO") : ""}
                      onChange={(event) => setExtraCost(event.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                    />
                    <input type="hidden" name="extraCost" value={extraCost} />
                  </label>
                </div>
            </div>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nota</span>
              <textarea
                name="note"
                rows={2}
                className={cn(controlClassName, "h-auto resize-none py-2")}
                placeholder="Ej. Compra a proveedor, merma, conteo fisico"
              />
            </label>

          </form>

          {/* Footer fijo: total y boton siempre visibles al fondo del modal. */}
          <div className="shrink-0 space-y-2 border-t border-border bg-background px-6 py-4">
            <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
              <span className="text-base font-semibold text-foreground">Total</span>
              <span className="text-2xl font-bold text-primary">
                ${totalToPay.toLocaleString("es-CO")}
              </span>
            </div>
            <Button type="submit" form="inventory-movement-form" className="w-full">
              Ingresar
            </Button>
          </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
