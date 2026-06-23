"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Barcode,
  Boxes,
  FileText,
  Hash,
  ImagePlus,
  Package,
  Plus,
  Tag,
  TrendingUp,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { adminUpdateProductAction } from "@/app/actions/product-actions";
import {
  ProductBundleField,
  type BundleProductOption,
  type ProductComponentDraft,
} from "@/components/admin/product-bundle-field";
import { ProductSuppliersField, type ProductSupplierDraft } from "@/components/admin/product-suppliers-field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { ProductPurchaseRow } from "@/lib/product-purchase-history";
import { calculateProfit, calculateRetailPrice, calculateWholesalePrice } from "@/lib/pricing";
import { Button, buttonVariants } from "../ui/button";

type CategoryOption = {
  id: string;
  name: string;
};

type SupplierOption = {
  id: string;
  name: string;
};

type EditProductInitialData = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  baseCost: number;
  price: number;
  wholesalePrice: number;
  retailMarginPct: number;
  wholesaleMarginPct: number;
  minWholesaleQty: number;
  minStock: number;
  categoryId: string | null;
  isBundle: boolean;
  suppliers: Array<{
    supplierId: string;
    supplierCost: number | null;
  }>;
  components: Array<{
    childId: string;
    quantity: number;
  }>;
  imageUrls: string[];
};

type EditProductFormProps = {
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  currency: SupportedCurrencyCode;
  bundleProducts: BundleProductOption[];
  initialData: EditProductInitialData;
  purchaseHistory?: ProductPurchaseRow[];
  purchaseHistoryLoading?: boolean;
};

export function EditProductForm({
  categories,
  suppliers,
  currency,
  bundleProducts,
  initialData,
  purchaseHistory = [],
  purchaseHistoryLoading = false,
}: EditProductFormProps) {
  const initialWholesaleEnabled =
    initialData.wholesalePrice > 0 ||
    initialData.wholesaleMarginPct > 0 ||
    initialData.minWholesaleQty > 1;
  const [name, setName] = useState(initialData.name);
  const [code, setCode] = useState(initialData.code ?? "");
  const [description, setDescription] = useState(initialData.description ?? "");
  const [seoTitle] = useState(initialData.seoTitle ?? "");
  const [seoDescription] = useState(initialData.seoDescription ?? "");
  const [baseCost, setBaseCost] = useState(String(Math.round(initialData.baseCost)));
  const [retailMarginPct, setRetailMarginPct] = useState(initialData.retailMarginPct.toFixed(2));
  const [retailPriceInput, setRetailPriceInput] = useState(String(Math.round(initialData.price)));
  const [retailPriceDirty, setRetailPriceDirty] = useState(true);
  const [wholesaleEnabled, setWholesaleEnabled] = useState(() => initialWholesaleEnabled);
  const [wholesaleMarginPct, setWholesaleMarginPct] = useState(initialData.wholesaleMarginPct.toFixed(2));
  const [wholesalePriceInput, setWholesalePriceInput] = useState(String(Math.round(initialData.wholesalePrice)));
  const [wholesalePriceDirty, setWholesalePriceDirty] = useState(true);
  const [minWholesaleQty, setMinWholesaleQty] = useState(String(initialData.minWholesaleQty));
  const [categoryId, setCategoryId] = useState(initialData.categoryId ?? "");
  const [minStock, setMinStock] = useState(String(initialData.minStock));
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [newImageUrls, setNewImageUrls] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState(initialData.imageUrls);
  const [currentStep, setCurrentStep] = useState(1);
  const [supplierRows, setSupplierRows] = useState<ProductSupplierDraft[]>(() =>
    initialData.suppliers.length > 0
      ? initialData.suppliers.map((supplier) => ({
          id: globalThis.crypto?.randomUUID?.() ?? `${supplier.supplierId}-${Math.random()}`,
          supplierId: supplier.supplierId,
          supplierCost: String(Math.round(supplier.supplierCost ?? initialData.baseCost)),
        }))
      : [
          {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
            supplierId: "",
            supplierCost: String(Math.round(initialData.baseCost)),
          },
        ],
  );
  const [isBundle, setIsBundle] = useState(initialData.isBundle);
  const [componentRows, setComponentRows] = useState<ProductComponentDraft[]>(() =>
    initialData.components.length > 0
      ? initialData.components.map((component) => ({
          id: globalThis.crypto?.randomUUID?.() ?? `${component.childId}-${Math.random()}`,
          childId: component.childId,
          quantity: String(component.quantity),
        }))
      : [
          {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
            childId: "",
            quantity: "1",
          },
        ],
  );
  const [dragActive, setDragActive] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      newImageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [newImageUrls]);

  const pricing = useMemo(() => {
    const cost = Number(baseCost) || 0;
    const retailMargin = Number(retailMarginPct) || 0;
    const wholesaleMargin = wholesaleEnabled ? Number(wholesaleMarginPct) || 0 : 0;
    const suggestedRetail = calculateRetailPrice(cost, retailMargin);
    const finalRetail = retailPriceDirty ? Number(retailPriceInput) || 0 : suggestedRetail;
    const suggestedWholesale = calculateWholesalePrice(cost, wholesaleMargin);
    const finalWholesale = wholesaleEnabled
      ? wholesalePriceDirty
        ? Number(wholesalePriceInput) || 0
        : suggestedWholesale
      : 0;
    const profit = calculateProfit(cost, finalRetail);
    const wholesaleProfit = calculateProfit(cost, finalWholesale);

    return {
      suggestedRetail,
      finalRetail,
      profit,
      suggestedWholesale,
      finalWholesale,
      wholesaleProfit,
      retail: formatMoney(finalRetail, currency),
      wholesale: formatMoney(finalWholesale, currency),
    };
  }, [
    baseCost,
    retailMarginPct,
    retailPriceInput,
    retailPriceDirty,
    wholesaleMarginPct,
    wholesalePriceInput,
    wholesalePriceDirty,
    currency,
    wholesaleEnabled,
  ]);

  // El % Detal es el margen sobre el precio: % = (precio - costo) / precio * 100.
  useEffect(() => {
    const price = Number(retailPriceInput) || 0;
    const cost = Number(baseCost) || 0;
    if (cost <= 0 || price <= 0) {
      return;
    }
    setRetailMarginPct(String(Math.round(((price - cost) / price) * 10000) / 100));
  }, [baseCost, retailPriceInput]);

  // El % Mayor tambien es el margen sobre el precio mayorista.
  useEffect(() => {
    const price = Number(wholesalePriceInput) || 0;
    const cost = Number(baseCost) || 0;
    if (cost <= 0 || price <= 0) {
      return;
    }
    setWholesaleMarginPct(String(Math.round(((price - cost) / price) * 10000) / 100));
  }, [baseCost, wholesalePriceInput]);

  const allImageUrls = useMemo(
    () => [...existingImageUrls, ...newImageUrls],
    [existingImageUrls, newImageUrls],
  );

  // Mantiene el indice de la foto visible dentro de rango.
  useEffect(() => {
    setPhotoIndex((index) => Math.min(index, Math.max(0, allImageUrls.length - 1)));
  }, [allImageUrls.length]);
  const safePhotoIndex = Math.min(photoIndex, Math.max(0, allImageUrls.length - 1));

  const step1Ready = name.trim().length >= 2;
  const step2Ready =
    Number(baseCost) > 0 &&
    Number(retailMarginPct) >= 0 &&
    pricing.finalRetail > 0 &&
    (!wholesaleEnabled ||
      (Number(wholesaleMarginPct) >= 0 && pricing.finalWholesale > 0 && Number(minWholesaleQty) >= 1));
  const steps = [
    { id: 1, label: "Producto", icon: Package },
    { id: 2, label: "Precios y compra", icon: Banknote },
    { id: 3, label: "Inventario", icon: Boxes },
  ] as const;

  const maxReachableStep = !step1Ready ? 1 : !step2Ready ? 2 : 3;
  const canGoToStep = (target: number) => target <= Math.max(currentStep, maxReachableStep);
  const goToStep = (target: number) => {
    if (canGoToStep(target)) {
      setCurrentStep(target);
    }
  };
  const canSubmit = step1Ready && step2Ready;

  const syncSelectedFiles = (files: File[]) => {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }

    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    setSelectedFiles(files);

    newImageUrls.forEach((url) => URL.revokeObjectURL(url));
    setNewImageUrls(files.map((file) => URL.createObjectURL(file)));
  };

  const removeImageAt = (index: number) => {
    if (index < existingImageUrls.length) {
      setExistingImageUrls((current) => current.filter((_, i) => i !== index));
      return;
    }

    const newIndex = index - existingImageUrls.length;
    const nextFiles = selectedFiles.filter((_, i) => i !== newIndex);
    syncSelectedFiles(nextFiles);
  };

  const addSupplierRow = () => {
    setSupplierRows((current) => [
      ...current,
      {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        supplierId: "",
        supplierCost: baseCost || "0",
      },
    ]);
  };

  const removeSupplierRow = (rowId: string) => {
    setSupplierRows((current) => current.filter((row) => row.id !== rowId));
  };

  const updateSupplierRow = (rowId: string, values: Partial<Omit<ProductSupplierDraft, "id">>) => {
    setSupplierRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...values } : row)));
  };

  const addComponentRow = () => {
    setComponentRows((current) => [
      ...current,
      {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        childId: "",
        quantity: "1",
      },
    ]);
  };

  const removeComponentRow = (rowId: string) => {
    setComponentRows((current) => current.filter((row) => row.id !== rowId));
  };

  const updateComponentRow = (rowId: string, values: Partial<Omit<ProductComponentDraft, "id">>) => {
    setComponentRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...values } : row)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <Tabs
          value={String(currentStep)}
          onValueChange={(value) => goToStep(Number(value))}
          className="shrink-0 px-6 pt-5"
        >
          <TabsList className="w-fit">
            {steps.map((step) => (
              <TabsTrigger key={step.id} value={String(step.id)} disabled={!canGoToStep(step.id)}>
                <step.icon className="h-4 w-4" />
                {step.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <form action={adminUpdateProductAction} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="productId" value={initialData.id} />
            <input type="hidden" name="existingImages" value={existingImageUrls.join("\n")} />
            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-5">

            <div className={currentStep === 1 ? "space-y-4" : "hidden"}>
              <div className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="block shrink-0 space-y-2">
                    <div
                      className={`flex flex-wrap items-start gap-2 rounded-xl p-1 transition ${
                        dragActive ? "bg-slate-100/80 ring-2 ring-[var(--primary)]/30" : ""
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        const dropped = Array.from(e.dataTransfer.files).filter((file) =>
                          file.type.startsWith("image/"),
                        );
                        if (dropped.length === 0) {
                          return;
                        }
                        syncSelectedFiles([...selectedFiles, ...dropped]);
                        setPhotoIndex(existingImageUrls.length + selectedFiles.length + dropped.length - 1);
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        name="images"
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length === 0) {
                            return;
                          }
                          syncSelectedFiles([...selectedFiles, ...files]);
                          setPhotoIndex(existingImageUrls.length + selectedFiles.length + files.length - 1);
                        }}
                      />
                      {allImageUrls.length > 0 ? (
                        <div className="group relative h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-slate-100">
                          <img
                            src={allImageUrls[safePhotoIndex]}
                            alt={`Foto ${safePhotoIndex + 1}`}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"
                            aria-label="Agregar mas fotos"
                          >
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow">
                              <Plus className="h-5 w-5" />
                            </span>
                          </button>
                          <Button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImageAt(safePhotoIndex);
                            }}
                            className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                            aria-label="Eliminar foto"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          className="h-32 w-32 flex-col gap-1.5 bg-zinc-200 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-600"
                          aria-label="Subir fotos del producto"
                        >
                          <ImagePlus className="size-6" />
                          <span className="text-xs font-medium">Fotos</span>
                        </Button>
                      )}
                    </div>
                    {allImageUrls.length > 1 ? (
                      <div className="flex w-32 items-center justify-center gap-1.5">
                        {allImageUrls.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setPhotoIndex(i)}
                            className={`h-1.5 rounded-full transition-all ${
                              i === safePhotoIndex ? "w-4 bg-slate-800" : "w-1.5 bg-slate-300 hover:bg-slate-400"
                            }`}
                            aria-label={`Ver foto ${i + 1}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex-1 space-y-4">
                    <label className="block space-y-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Package className="h-4 w-4 text-slate-500" />Nombre</span>
                      <Input name="name" placeholder="EJ. CAMISA OXFORD" required value={name} onChange={(e) => setName(e.target.value.toUpperCase())} className="uppercase" />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Banknote className="h-4 w-4 text-slate-500" />Precio</span>
                      <MoneyInput
                        value={retailPriceInput}
                        onValueChange={(raw) => {
                          setRetailPriceInput(raw);
                          setRetailPriceDirty(true);
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Barcode className="h-4 w-4 text-slate-500" />Codigo</span>
                    <Input name="code" placeholder="Ej. CAM-001" value={code} onChange={(e) => setCode(e.target.value)} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Tag className="h-4 w-4 text-slate-500" />Categoria</span>
                    <select name="categoryId" className="field-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                      <option value="">Sin categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><FileText className="h-4 w-4 text-slate-500" />Descripcion</span>
                  <Textarea
                    name="description"
                    placeholder="Descripcion del producto"
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                {/* Campos SEO ocultos temporalmente (se conserva el valor existente) */}
                <input type="hidden" name="seoTitle" value={seoTitle} />
                <input type="hidden" name="seoDescription" value={seoDescription} />
                <ProductBundleField
                  isBundle={isBundle}
                  onToggle={setIsBundle}
                  products={bundleProducts}
                  rows={componentRows}
                  currency={currency}
                  onAdd={addComponentRow}
                  onRemove={removeComponentRow}
                  onChange={updateComponentRow}
                />
              </div>
            </div>

            <div className={currentStep === 2 ? "space-y-4" : "hidden"}>
              <div className="grid gap-4 md:grid-cols-12">
                <label className="space-y-1.5 md:col-span-6">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Tag className="h-4 w-4 text-slate-500" />Precio final</span>
                  <MoneyInput
                    name="retailPrice"
                    value={retailPriceInput}
                    onValueChange={(raw) => {
                      setRetailPriceInput(raw);
                      setRetailPriceDirty(true);
                    }}
                  />
                </label>
                <label className="space-y-1.5 md:col-span-4">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Wallet className="h-4 w-4 text-slate-500" />Costo compra ({currency})</span>
                  <MoneyInput
                    name="baseCost"
                    value={baseCost}
                    onValueChange={setBaseCost}
                  />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><TrendingUp className="h-4 w-4 text-slate-500" />% Detal</span>
                  <Input
                    value={retailMarginPct ? `${retailMarginPct}%` : ""}
                    readOnly
                    className="bg-slate-100 text-slate-600"
                  />
                  <input type="hidden" name="retailMarginPct" value={retailMarginPct} />
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-slate-900"
                  checked={wholesaleEnabled}
                  onChange={(e) => setWholesaleEnabled(e.target.checked)}
                />
                Habilitar venta por mayor
              </label>
              <div className="grid gap-4 md:grid-cols-12">
                {wholesaleEnabled ? (
                  <>
                    <label className="space-y-1.5 md:col-span-6">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Tag className="h-4 w-4 text-slate-500" />Precio final</span>
                      <MoneyInput
                        name="wholesalePrice"
                        value={wholesalePriceInput}
                        onValueChange={(raw) => {
                          setWholesalePriceInput(raw);
                          setWholesalePriceDirty(true);
                        }}
                      />
                    </label>
                    <label className="space-y-1.5 md:col-span-4">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Wallet className="h-4 w-4 text-slate-500" />Costo compra ({currency})</span>
                      <Input
                        value={baseCost ? Number(baseCost).toLocaleString("es-CO") : ""}
                        readOnly
                        className="bg-slate-100 text-slate-600"
                      />
                    </label>
                    <label className="space-y-1.5 md:col-span-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Boxes className="h-4 w-4 text-slate-500" />% Mayor</span>
                      <Input
                        value={wholesaleMarginPct ? `${wholesaleMarginPct}%` : ""}
                        readOnly
                        className="bg-slate-100 text-slate-600"
                      />
                      <input type="hidden" name="wholesaleMarginPct" value={wholesaleMarginPct} />
                    </label>
                    <label className="space-y-1.5 md:col-span-12">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Hash className="h-4 w-4 text-slate-500" />Min. unidades mayor</span>
                      <Input
                        name="minWholesaleQty"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="6"
                        required
                        value={minWholesaleQty}
                        onChange={(e) => setMinWholesaleQty(e.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <input type="hidden" name="wholesaleMarginPct" value="0" />
                    <input type="hidden" name="wholesalePrice" value="0" />
                    <input type="hidden" name="minWholesaleQty" value="1" />
                  </>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 border-t pt-4">
                <label className="hidden">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Truck className="h-4 w-4 text-slate-500" />Proveedor principal</span>
                  <select name="legacySupplierId" className="hidden" defaultValue="">
                    <option value="">Sin proveedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!isBundle ? (
                  <ProductSuppliersField
                    suppliers={suppliers}
                    rows={supplierRows}
                    currency={currency}
                    onAdd={addSupplierRow}
                    onRemove={removeSupplierRow}
                    onChange={updateSupplierRow}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-[var(--line)] bg-slate-50/60 px-3 py-3 text-xs text-slate-500 md:col-span-2">
                    Este producto es un combo: los proveedores se toman de cada componente.
                  </p>
                )}
              </div>
            </div>

            <div className={currentStep === 3 ? "space-y-4" : "hidden"}>
              <label className="block max-w-xs space-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Boxes className="h-4 w-4 text-slate-500" />Stock minimo</span>
                <Input
                  name="minStock"
                  type="number"
                  min="0"
                  step="1"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                />
                <span className="text-xs text-slate-500">Cantidad minima antes de marcar bajo stock.</span>
              </label>

              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Boxes className="h-4 w-4 text-slate-500" />Compras en inventario</span>
                {purchaseHistoryLoading ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] bg-slate-50/60 px-3 py-3 text-xs text-slate-500">
                    Cargando movimientos...
                  </p>
                ) : purchaseHistory.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] bg-slate-50/60 px-3 py-3 text-xs text-slate-500">
                    Este producto no tiene compras registradas en inventario.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Fecha</th>
                          <th className="px-3 py-2 text-left">Cant</th>
                          <th className="px-3 py-2 text-left">Precio compra</th>
                          <th className="px-3 py-2 text-left">Pagado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseHistory.map((row) => (
                          <tr key={row.id} className="border-t border-[var(--line)]">
                            <td className="px-3 py-2 text-slate-700">
                              {new Date(row.date).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" })}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{row.quantity}</td>
                            <td className="px-3 py-2 text-slate-700">{formatMoney(row.purchaseCost, currency)}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                                  row.isPaid
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-600"
                                }`}
                              >
                                {row.isPaid ? "Pagado" : "Pendiente"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-white px-6 py-4">
              <div>
                {currentStep > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCurrentStep((step) => Math.max(1, step - 1))}
                  >
                    ← Atras
                  </Button>
                ) : (
                  <Link href="/admin/productos" className={buttonVariants({ variant: "outline" })}>
                    Cancelar
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {currentStep >= 2 ? (
                  <Button type="submit" disabled={!canSubmit}>
                    Guardar cambios
                  </Button>
                ) : null}
                {currentStep < 3 ? (
                  <Button type="button" onClick={() => goToStep(currentStep + 1)} disabled={!canGoToStep(currentStep + 1)}>
                    Siguiente
                  </Button>
                ) : null}
              </div>
            </div>
        </form>
      </div>
    </div>
  );
}
