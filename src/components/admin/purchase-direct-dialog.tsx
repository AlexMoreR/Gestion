"use client";

import * as React from "react";
import { AlignLeft, Boxes, ImagePlus, Loader2, Palette, Plus, RefreshCw, Search, ShoppingCart, Trash2 } from "lucide-react";
import { adminCreateDirectPurchaseAction } from "@/app/actions/inventory-actions";
import { adminUploadQuoteImageAction } from "@/app/actions/quote-actions";
import { ProductThumb } from "@/components/admin/product-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type SupplierOption = {
  id: string;
  name: string;
};

type PurchaseDirectDialogProps = {
  products: ProductOption[];
  // Proveedores (con su costo) asociados a cada producto, para autocompletar el costo.
  suppliersByProduct: Record<string, SupplierCost[]>;
  // Componentes de cada combo (por id de combo), para listar item por item.
  comboComponents: Record<string, ComboComponentOption[]>;
  // Todos los proveedores activos (para costos adicionales como el envio).
  suppliers: SupplierOption[];
  currency: SupportedCurrencyCode;
};

// Costo adicional de la compra (ej. envio): concepto, proveedor y monto.
type ExtraCost = {
  uid: string;
  concept: string;
  supplierId: string;
  supplierName: string;
  amount: number;
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
  color: string;
  description: string;
  imageUrl: string;
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
  suppliers,
  currency,
}: PurchaseDirectDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<PurchaseLine[]>([]);

  // Costos adicionales (ej. envio) y borrador del que se esta agregando.
  const [extraCosts, setExtraCosts] = React.useState<ExtraCost[]>([]);
  const [extraConcept, setExtraConcept] = React.useState("");
  const [extraSupplierId, setExtraSupplierId] = React.useState("");
  const [extraAmount, setExtraAmount] = React.useState("");

  // Modal de seleccion de producto (mismo flujo que cotizacion).
  const [openProductModal, setOpenProductModal] = React.useState(false);
  const [productLookup, setProductLookup] = React.useState("");
  const [draftProductId, setDraftProductId] = React.useState("");
  const [draftSupplierId, setDraftSupplierId] = React.useState("");
  const [draftQuantity, setDraftQuantity] = React.useState("1");
  const [draftCost, setDraftCost] = React.useState("");
  const [draftColor, setDraftColor] = React.useState("");
  const [draftDescription, setDraftDescription] = React.useState("");
  const [draftImageUrl, setDraftImageUrl] = React.useState("");
  const [isUploadingImage, setIsUploadingImage] = React.useState(false);
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
    setDraftColor("");
    setDraftDescription("");
    setDraftImageUrl("");
    setIsUploadingImage(false);
    setComponentCharges({});
    setProductFormError("");
  };

  const handleImageUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProductFormError("Solo se permiten archivos de imagen.");
      return;
    }
    setIsUploadingImage(true);
    setProductFormError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await adminUploadQuoteImageAction(formData);
      if (!result.ok) {
        setProductFormError(result.error);
        return;
      }
      setDraftImageUrl(result.url);
    } catch {
      setProductFormError("No se pudo subir la imagen.");
    } finally {
      setIsUploadingImage(false);
    }
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
    setExtraCosts([]);
    setExtraConcept("");
    setExtraSupplierId("");
    setExtraAmount("");
  };

  const addExtraCost = () => {
    const amount = Number(extraAmount.replace(/\D/g, "")) || 0;
    if (amount <= 0) return;
    const supplierName = suppliers.find((s) => s.id === extraSupplierId)?.name ?? "";
    setExtraCosts((current) => [
      ...current,
      {
        uid: crypto.randomUUID(),
        concept: extraConcept.trim(),
        supplierId: extraSupplierId,
        supplierName,
        amount,
      },
    ]);
    setExtraConcept("");
    setExtraSupplierId("");
    setExtraAmount("");
  };

  const removeExtraCost = (uid: string) => {
    setExtraCosts((current) => current.filter((cost) => cost.uid !== uid));
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
        color: isComboDraft ? "" : draftColor.trim(),
        description: isComboDraft ? "" : draftDescription.trim(),
        imageUrl: isComboDraft ? "" : draftImageUrl.trim(),
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
  const linesTotal = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
  const extrasTotal = extraCosts.reduce((sum, cost) => sum + cost.amount, 0);
  const total = linesTotal + extrasTotal;

  const serializedExtraCosts = JSON.stringify(
    extraCosts.map((cost) => ({
      concept: cost.concept,
      supplierId: cost.supplierId,
      amount: cost.amount,
    })),
  );

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
            color: line.color,
            description: line.description,
            imageUrl: line.imageUrl,
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

      <Dialog open={open} onOpenChange={(value) => (value ? null : handleClose())}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <form action={adminCreateDirectPurchaseAction} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="returnTo" value="/admin/ordenes" />
            <input type="hidden" name="items" value={serializedItems} />
            <input type="hidden" name="extraCosts" value={serializedExtraCosts} />

            {/* Header fijo */}
            <DialogHeader className="shrink-0 border-b border-border px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-3 pr-8">
                <DialogTitle className="inline-flex items-center gap-2 text-lg font-semibold text-foreground">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  <span>Comprar</span>
                </DialogTitle>
                <DatePicker name="movementDate" required defaultValue={today()} className="w-40" />
              </div>
            </DialogHeader>

            {/* Cuerpo scrolleable */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Lineas agregadas */}
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-right">Cant</th>
                      <th className="px-3 py-2 text-right">Costo unit.</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
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

                        // Combo: una fila por cada componente (estilo cotizacion), con su foto.
                        // Un encabezado agrupa el combo y lleva el boton de quitar.
                        if (line.isBundle) {
                          return (
                            <React.Fragment key={line.uid}>
                              <tr className="border-t border-border bg-muted/30">
                                <td className="px-3 py-2" colSpan={4}>
                                  <div className="flex items-center gap-2">
                                    <ProductThumb
                                      src={product?.thumbnailUrl ?? ""}
                                      alt={product?.name ?? "Combo"}
                                      className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
                                    />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-foreground">
                                        {product?.name ?? "Combo"}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {product?.code || "Sin codigo"}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right align-middle">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeLine(line.uid)}
                                    aria-label="Quitar combo"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </td>
                              </tr>
                              {line.components.map((component) => {
                                const child = productById.get(component.childId);
                                const units = component.quantity * line.quantity;
                                return (
                                  <tr key={component.childId} className="border-t border-border/50">
                                    <td className="px-3 py-1.5 pl-6 text-foreground">
                                      <div className="flex items-center gap-2">
                                        <ProductThumb
                                          src={child?.thumbnailUrl ?? ""}
                                          alt={component.name}
                                          className="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
                                        />
                                        <div className="min-w-0">
                                          <p className="truncate text-sm text-foreground">{component.name}</p>
                                          <p className="truncate text-xs text-muted-foreground">
                                            {child?.code || "Sin codigo"}
                                          </p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-foreground">{units}</td>
                                    <td className="px-3 py-1.5 text-right text-foreground">
                                      {formatMoney(component.cost, currency)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-medium text-foreground">
                                      {formatMoney(component.cost * line.quantity, currency)}
                                    </td>
                                    <td className="px-3 py-1.5" />
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        }

                        return (
                          <tr key={line.uid} className="border-t border-border">
                            <td className="px-3 py-2 text-foreground">
                              <div className="flex items-center gap-2">
                                <ProductThumb
                                  src={product?.thumbnailUrl ?? ""}
                                  alt={product?.name ?? "Producto"}
                                  className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
                                />
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{product?.name ?? "Producto"}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {product?.code || "Sin codigo"}
                                  </p>
                                </div>
                              </div>
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

              {/* Costos adicionales (ej. envio): concepto, proveedor y monto */}
              <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                <span className="text-sm font-medium text-foreground">Costo adicional</span>

                {extraCosts.length > 0 ? (
                  <div className="space-y-1.5">
                    {extraCosts.map((cost) => (
                      <div
                        key={cost.uid}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {cost.concept || "Costo adicional"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {cost.supplierName || "Sin proveedor"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold text-foreground">
                            {formatMoney(cost.amount, currency)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeExtraCost(cost.uid)}
                            aria-label="Quitar costo adicional"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="grid items-end gap-2 sm:grid-cols-[1fr_minmax(0,11rem)_7rem_auto]">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Concepto</span>
                    <Input
                      value={extraConcept}
                      onChange={(event) => setExtraConcept(event.target.value)}
                      placeholder="Ej. Envio"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Proveedor</span>
                    <select
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
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Monto</span>
                    <Input
                      inputMode="numeric"
                      value={extraAmount ? Number(extraAmount).toLocaleString("es-CO") : ""}
                      onChange={(event) => setExtraAmount(event.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                    />
                  </div>
                  <Button type="button" onClick={addExtraCost} aria-label="Agregar costo adicional">
                    <Plus className="h-4 w-4" />
                    Agregar
                  </Button>
                </div>
              </div>
            </div>

            {/* Footer fijo */}
            <div className="shrink-0 space-y-3 border-t border-border bg-background px-5 py-4">
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
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de seleccion de producto (mismo flujo que cotizacion) */}
      <Dialog
        open={open && openProductModal}
        onOpenChange={(value) => (value ? null : setOpenProductModal(false))}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-5 py-4">
            <DialogTitle className="inline-flex items-center gap-2 pr-8 text-base font-semibold text-foreground">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <span>Agregar producto</span>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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
                      {draftProduct?.code || "Sin codigo"}
                    </p>
                  </div>
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
                  <div className="grid gap-3 rounded-xl border border-border bg-muted/60 p-3 md:grid-cols-2">
                    <label className="space-y-1.5 md:col-span-2">
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
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                        Color
                      </span>
                      <Input
                        value={draftColor}
                        onChange={(event) => setDraftColor(event.target.value)}
                        placeholder="Color"
                      />
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-foreground">Costo unitario</span>
                      <Input
                        inputMode="numeric"
                        value={draftCost ? Number(draftCost).toLocaleString("es-CO") : ""}
                        onChange={(event) => setDraftCost(event.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                      />
                    </label>

                    {/* Foto opcional + descripcion */}
                    <div className="grid gap-3 rounded-xl border border-border bg-card p-3 md:col-span-2 md:grid-cols-[7rem_minmax(0,1fr)] md:items-start">
                      <div className="flex flex-col items-start gap-1.5">
                        <label
                          className="group relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-muted transition hover:border-[var(--primary)]/50"
                          title="Subir foto del producto"
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={isUploadingImage}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              void handleImageUpload(file);
                            }}
                          />
                          {draftImageUrl || draftProduct?.thumbnailUrl ? (
                            <>
                              <ProductThumb
                                src={draftImageUrl || draftProduct?.thumbnailUrl || ""}
                                alt={draftProduct?.name ?? "Producto"}
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                                {isUploadingImage ? (
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                  <>
                                    <ImagePlus className="h-5 w-5" />
                                    <span className="text-[11px] font-medium">Cambiar foto</span>
                                  </>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
                              {isUploadingImage ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <>
                                  <ImagePlus className="h-5 w-5" />
                                  <span className="text-[11px] font-medium">Agregar foto</span>
                                </>
                              )}
                            </div>
                          )}
                        </label>
                        {draftImageUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto px-1 py-0 text-xs text-muted-foreground"
                            onClick={() => setDraftImageUrl("")}
                          >
                            Quitar foto
                          </Button>
                        ) : null}
                      </div>

                      <label className="space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                          Descripcion
                        </span>
                        <textarea
                          value={draftDescription}
                          onChange={(event) => setDraftDescription(event.target.value)}
                          rows={3}
                          className={cn(controlClassName, "h-auto resize-none py-2")}
                          placeholder="Descripcion del item"
                        />
                      </label>
                    </div>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
