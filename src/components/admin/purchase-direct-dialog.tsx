"use client";

import * as React from "react";
import { Boxes, Plus, RefreshCw, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { adminCreateDirectPurchaseAction } from "@/app/actions/inventory-actions";
import { ProductThumb } from "@/components/admin/product-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

type ProductOption = {
  id: string;
  name: string;
  code: string | null;
  baseCost: number;
  stock: number;
  thumbnailUrl: string;
  isBundle: boolean;
};

type SupplierCost = {
  id: string;
  name: string;
  cost: number | null;
};

type ComboComponentOption = {
  childId: string;
  name: string;
  code: string | null;
  quantity: number;
  thumbnailUrl: string;
};

type PurchaseDirectDialogProps = {
  products: ProductOption[];
  // Proveedores (con su costo) asociados a cada producto, para autocompletar el costo.
  suppliersByProduct: Record<string, SupplierCost[]>;
  // Componentes de cada combo (por id de combo), para listar item por item.
  comboComponents: Record<string, ComboComponentOption[]>;
  currency: SupportedCurrencyCode;
};

// Cargo por componente de un combo (cada item con su proveedor y costo).
type LineComponent = {
  childId: string;
  name: string;
  quantity: number;
  supplierId: string;
  supplierName: string;
  cost: number;
};

type PurchaseLine = {
  uid: string;
  productId: string;
  quantity: number;
  isBundle: boolean;
  // Costo unitario: el costo del producto, o la suma de componentes del combo.
  unitCost: number;
  supplierId: string;
  supplierName: string;
  components: LineComponent[];
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function PurchaseDirectDialog({
  products,
  suppliersByProduct,
  comboComponents,
  currency,
}: PurchaseDirectDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<PurchaseLine[]>([]);

  // Modal de seleccion de producto (mismo flujo que cotizacion).
  const [openProductModal, setOpenProductModal] = React.useState(false);
  const [productLookup, setProductLookup] = React.useState("");
  const [draftProductId, setDraftProductId] = React.useState("");
  const [draftSupplierId, setDraftSupplierId] = React.useState("");
  const [draftQuantity, setDraftQuantity] = React.useState("1");
  const [draftCost, setDraftCost] = React.useState("");
  // Combo: proveedor y costo elegidos por cada componente (id de componente -> ...).
  const [componentCharges, setComponentCharges] = React.useState<
    Record<string, { supplierId: string; cost: string }>
  >({});
  const [productFormError, setProductFormError] = React.useState("");

  const productById = React.useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const draftProduct = draftProductId ? productById.get(draftProductId) ?? null : null;
  const draftSupplierOptions = draftProductId ? suppliersByProduct[draftProductId] ?? [] : [];
  const isComboDraft = Boolean(draftProduct?.isBundle);
  const draftComboParts = isComboDraft ? comboComponents[draftProductId] ?? [] : [];

  // Proveedores disponibles para un componente del combo.
  const suppliersForChild = React.useCallback(
    (childId: string): SupplierCost[] => suppliersByProduct[childId] ?? [],
    [suppliersByProduct],
  );

  const filteredProducts = React.useMemo(() => {
    const q = productLookup.trim().toLowerCase();
    if (!q) return products.slice(0, 24);
    return products
      .filter((product) => `${product.code ?? ""} ${product.name}`.toLowerCase().includes(q))
      .slice(0, 24);
  }, [products, productLookup]);

  // Costo por defecto del proveedor para el producto (cae al costo base).
  const costFor = React.useCallback(
    (productId: string, supplierId: string): number => {
      const fromSupplier = (suppliersByProduct[productId] ?? []).find((s) => s.id === supplierId);
      if (fromSupplier && fromSupplier.cost !== null) return Math.round(fromSupplier.cost);
      return Math.round(productById.get(productId)?.baseCost ?? 0);
    },
    [productById, suppliersByProduct],
  );

  const resetDraft = () => {
    setProductLookup("");
    setDraftProductId("");
    setDraftSupplierId("");
    setDraftQuantity("1");
    setDraftCost("");
    setComponentCharges({});
    setProductFormError("");
  };

  // Costo por defecto del primer proveedor de un componente (cae al costo base).
  const defaultChargeForChild = React.useCallback(
    (childId: string): { supplierId: string; cost: string } => {
      const supplier = (suppliersByProduct[childId] ?? [])[0];
      if (!supplier) return { supplierId: "", cost: "" };
      const cost = supplier.cost !== null ? Math.round(supplier.cost) : Math.round(productById.get(childId)?.baseCost ?? 0);
      return { supplierId: supplier.id, cost: cost > 0 ? String(cost) : "" };
    },
    [productById, suppliersByProduct],
  );

  const reset = () => {
    setLines([]);
    resetDraft();
    setOpenProductModal(false);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const openAddProductModal = () => {
    resetDraft();
    setOpenProductModal(true);
  };

  // Al elegir producto del grid: si es combo, inicializa proveedor/costo por
  // cada componente; si no, preselecciona su proveedor por defecto.
  const applyProductSelection = (product: ProductOption) => {
    setDraftProductId(product.id);
    setProductLookup(product.code || product.name);
    setProductFormError("");

    if (product.isBundle) {
      const charges: Record<string, { supplierId: string; cost: string }> = {};
      for (const part of comboComponents[product.id] ?? []) {
        charges[part.childId] = defaultChargeForChild(part.childId);
      }
      setComponentCharges(charges);
      setDraftSupplierId("");
      setDraftCost("");
      return;
    }

    const defaultSupplier = (suppliersByProduct[product.id] ?? [])[0];
    const supplierId = defaultSupplier?.id ?? "";
    setDraftSupplierId(supplierId);
    const cost = costFor(product.id, supplierId);
    setDraftCost(cost > 0 ? String(cost) : "");
    setComponentCharges({});
  };

  const clearDraftProductSelection = () => {
    setProductLookup("");
    setDraftProductId("");
    setDraftSupplierId("");
    setDraftCost("");
    setComponentCharges({});
    setProductFormError("");
  };

  // Al cambiar el proveedor de la linea, reajusta el costo a su precio por defecto.
  const handleDraftSupplierChange = (supplierId: string) => {
    setDraftSupplierId(supplierId);
    if (draftProductId) {
      const cost = costFor(draftProductId, supplierId);
      setDraftCost(cost > 0 ? String(cost) : "");
    }
  };

  // Combo: cambiar el proveedor de un componente reajusta su costo por defecto.
  const handleComponentSupplierChange = (childId: string, supplierId: string) => {
    const supplier = suppliersForChild(childId).find((s) => s.id === supplierId);
    setComponentCharges((current) => ({
      ...current,
      [childId]: {
        supplierId,
        cost:
          supplier && supplier.cost !== null
            ? String(Math.round(supplier.cost))
            : current[childId]?.cost ?? "",
      },
    }));
  };

  const handleComponentCostChange = (childId: string, raw: string) => {
    const cost = raw.replace(/\D/g, "");
    setComponentCharges((current) => ({
      ...current,
      [childId]: { supplierId: current[childId]?.supplierId ?? "", cost },
    }));
  };

  // Costo unitario del borrador: combo = suma de sus componentes; si no, el costo.
  const draftUnitCost = isComboDraft
    ? draftComboParts.reduce(
        (sum, part) => sum + (Number(componentCharges[part.childId]?.cost || 0) || 0),
        0,
      )
    : Number(draftCost.replace(/\D/g, "")) || 0;

  const addDraftProduct = () => {
    setProductFormError("");
    if (!draftProductId) {
      setProductFormError("Selecciona un producto.");
      return;
    }
    const quantity = Math.trunc(Number(draftQuantity) || 0);
    if (quantity <= 0) {
      setProductFormError("La cantidad debe ser mayor a 0.");
      return;
    }

    const components: LineComponent[] = isComboDraft
      ? draftComboParts.map((part) => {
          const entry = componentCharges[part.childId] ?? { supplierId: "", cost: "" };
          const supplierName = suppliersForChild(part.childId).find((s) => s.id === entry.supplierId)?.name ?? "";
          return {
            childId: part.childId,
            name: part.name,
            quantity: part.quantity,
            supplierId: entry.supplierId,
            supplierName,
            cost: Number(entry.cost || 0) || 0,
          };
        })
      : [];

    const supplierName = draftSupplierOptions.find((s) => s.id === draftSupplierId)?.name ?? "";
    setLines((current) => [
      ...current,
      {
        uid: crypto.randomUUID(),
        productId: draftProductId,
        quantity,
        isBundle: isComboDraft,
        unitCost: draftUnitCost,
        supplierId: isComboDraft ? "" : draftSupplierId,
        supplierName: isComboDraft ? "" : supplierName,
        components,
      },
    ]);
    setOpenProductModal(false);
    resetDraft();
  };

  const removeLine = (uid: string) => {
    setLines((current) => current.filter((line) => line.uid !== uid));
  };

  const draftLineTotal = draftUnitCost * (Math.trunc(Number(draftQuantity) || 0) || 0);
  const total = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);

  const serializedItems = JSON.stringify(
    lines.map((line) =>
      line.isBundle
        ? {
            productId: line.productId,
            quantity: line.quantity,
            components: line.components.map((component) => ({
              childId: component.childId,
              supplierId: component.supplierId,
              cost: component.cost,
            })),
          }
        : {
            productId: line.productId,
            quantity: line.quantity,
            cost: line.unitCost,
            supplierId: line.supplierId,
          },
    ),
  );

  const canSubmit = lines.length > 0;

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Nueva compra"
          onClick={handleClose}
        >
          <div
            className="relative mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col overflow-y-auto overflow-x-hidden rounded-none border border-border bg-card p-3 sm:my-6 sm:min-h-0 sm:max-h-[92vh] sm:rounded-xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <form action={adminCreateDirectPurchaseAction} className="space-y-4">
              <input type="hidden" name="returnTo" value="/admin/ordenes" />
              <input type="hidden" name="items" value={serializedItems} />

              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-foreground">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    <span>Comprar</span>
                  </h2>
                  <DatePicker name="movementDate" required defaultValue={today()} className="w-40" />
                </div>
                <Button type="button" variant="outline" size="icon" onClick={handleClose} aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Lineas agregadas */}
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-left">Proveedor</th>
                      <th className="px-3 py-2 text-right">Cant</th>
                      <th className="px-3 py-2 text-right">Costo unit.</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                          <div className="flex flex-col items-center gap-3">
                            <div className="rounded-full border border-border bg-muted p-2">
                              <Boxes className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p>Aun no has agregado productos.</p>
                            <Button type="button" size="lg" onClick={openAddProductModal}>
                              <Plus className="h-4 w-4" />
                              Agregar producto
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      lines.map((line) => {
                        const product = productById.get(line.productId);
                        return (
                          <tr key={line.uid} className="border-t border-border align-top">
                            <td className="px-3 py-2 text-foreground">
                              <p className="font-medium">{product?.name ?? "Producto"}</p>
                              <p className="text-xs text-muted-foreground">{product?.code || "Sin codigo"}</p>
                              {line.isBundle ? (
                                <ul className="mt-1 space-y-0.5">
                                  {line.components.map((component) => (
                                    <li key={component.childId} className="text-xs text-muted-foreground">
                                      • {component.name} — {component.supplierName || "Sin proveedor"} ·{" "}
                                      {formatMoney(component.cost, currency)}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-foreground">
                              {line.isBundle ? (
                                <span className="text-muted-foreground">Varios (combo)</span>
                              ) : (
                                line.supplierName || <span className="text-muted-foreground">Sin proveedor</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-foreground">{line.quantity}</td>
                            <td className="px-3 py-2 text-right text-foreground">
                              {formatMoney(line.unitCost, currency)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-foreground">
                              {formatMoney(line.unitCost * line.quantity, currency)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLine(line.uid)}
                                aria-label="Quitar producto"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {lines.length > 0 ? (
                <div className="flex justify-center">
                  <Button type="button" size="lg" onClick={openAddProductModal}>
                    <Plus className="h-4 w-4" />
                    Agregar producto
                  </Button>
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
                <span className="text-base font-semibold text-foreground">Total compra</span>
                <span className="text-2xl font-bold text-primary">{formatMoney(total, currency)}</span>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" size="lg" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button type="submit" size="lg" disabled={!canSubmit} className="w-full sm:w-auto">
                  Registrar compra
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Modal de seleccion de producto (mismo flujo que cotizacion) */}
      {open && openProductModal ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label="Agregar producto"
          onClick={() => setOpenProductModal(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-border bg-card p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
                  <Boxes className="h-4 w-4 text-muted-foreground" />
                  <span>Agregar producto</span>
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setOpenProductModal(false)}
                aria-label="Cerrar modal de producto"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {!draftProductId ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={productLookup}
                    onChange={(event) => setProductLookup(event.target.value)}
                    className="pl-9"
                    placeholder="Buscar codigo o producto"
                    autoFocus
                  />
                </div>

                {filteredProducts.length > 0 ? (
                  <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => applyProductSelection(product)}
                        className="flex items-stretch overflow-hidden rounded-md border border-border bg-card text-left transition hover:border-[var(--primary)]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="relative w-14 shrink-0 self-stretch">
                          <ProductThumb
                            src={product.thumbnailUrl}
                            alt={product.name}
                            className="h-full w-full bg-muted object-cover"
                          />
                          {/* Bolita de stock; para combos es cuantos se pueden armar con sus componentes */}
                          <span
                            className={`absolute bottom-0.5 right-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white shadow ${
                              product.stock <= 0 ? "bg-red-500" : "bg-emerald-500"
                            }`}
                          >
                            {product.stock}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-2.5">
                          <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted-foreground">{product.code || "Sin codigo"}</p>
                            <span className="shrink-0 text-xs font-semibold text-foreground">
                              {formatMoney(product.baseCost, currency)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
                    Sin coincidencias
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-2.5">
                  <ProductThumb
                    src={draftProduct?.thumbnailUrl ?? ""}
                    alt={draftProduct?.name ?? ""}
                    className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{draftProduct?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {draftProduct?.code || "Sin codigo"} · Stock {draftProduct?.stock ?? 0}
                    </p>
                  </div>
                  {isComboDraft ? (
                    <label className="flex shrink-0 flex-col gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Cantidad</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={draftQuantity}
                        onChange={(event) => setDraftQuantity(event.target.value)}
                        className="h-9 w-20"
                      />
                    </label>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={clearDraftProductSelection}
                    aria-label="Cambiar producto"
                    title="Cambiar producto"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                {isComboDraft ? (
                  <div className="space-y-3 rounded-xl border border-border bg-muted/60 p-3">
                    <div className="space-y-2">
                      <div className="space-y-2">
                        {draftComboParts.map((part) => {
                          const partSuppliers = suppliersForChild(part.childId);
                          const entry = componentCharges[part.childId] ?? { supplierId: "", cost: "" };
                          return (
                            <div
                              key={part.childId}
                              className="grid items-end gap-2 sm:grid-cols-[1fr_minmax(0,10rem)_minmax(0,8rem)]"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <ProductThumb
                                  src={part.thumbnailUrl}
                                  alt={part.name}
                                  className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">{part.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {part.code ? `${part.code} · ` : ""}x{part.quantity}
                                  </p>
                                </div>
                              </div>
                              <select
                                value={entry.supplierId}
                                onChange={(event) => handleComponentSupplierChange(part.childId, event.target.value)}
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
                                onChange={(event) => handleComponentCostChange(part.childId, event.target.value)}
                                placeholder="Precio"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 rounded-xl border border-border bg-muted/60 p-3 md:grid-cols-3">
                    <label className="space-y-1.5 md:col-span-3">
                      <span className="text-sm font-medium text-foreground">Proveedor</span>
                      <select
                        value={draftSupplierId}
                        onChange={(event) => handleDraftSupplierChange(event.target.value)}
                        className={cn(controlClassName, "appearance-none")}
                      >
                        <option value="">Sin proveedor</option>
                        {draftSupplierOptions.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-foreground">Cantidad</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={draftQuantity}
                        onChange={(event) => setDraftQuantity(event.target.value)}
                      />
                    </label>

                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-sm font-medium text-foreground">Costo unitario</span>
                      <Input
                        inputMode="numeric"
                        value={draftCost ? Number(draftCost).toLocaleString("es-CO") : ""}
                        onChange={(event) => setDraftCost(event.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                      />
                    </label>
                  </div>
                )}

                {productFormError ? (
                  <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                    {productFormError}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">Total a pagar</span>
                  <span className="text-xl font-bold text-[var(--primary)]">
                    {formatMoney(draftLineTotal, currency)}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" size="lg" onClick={() => setOpenProductModal(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" size="lg" onClick={addDraftProduct}>
                    Agregar producto
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
