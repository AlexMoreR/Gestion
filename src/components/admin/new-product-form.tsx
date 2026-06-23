"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Barcode,
  Boxes,
  Banknote,
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
import { adminCreateProductAction } from "@/app/actions/product-actions";
import {
  ProductBundleField,
  type BundleProductOption,
  type ProductComponentDraft,
} from "@/components/admin/product-bundle-field";
import { ProductSuppliersField, type ProductSupplierDraft } from "@/components/admin/product-suppliers-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
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

type NewProductFormProps = {
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  currency: SupportedCurrencyCode;
  bundleProducts: BundleProductOption[];
  onCancel?: () => void;
};

function SaveProductButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Guardando..." : "Guardar producto"}
    </Button>
  );
}

type NewProductDraft = {
  name: string;
  code: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  baseCost: string;
  retailMarginPct: string;
  retailPriceInput: string;
  wholesaleMarginPct: string;
  wholesalePriceInput: string;
  minWholesaleQty: string;
  wholesaleEnabled: boolean;
  retailPriceDirty: boolean;
  wholesalePriceDirty: boolean;
  categoryId: string;
  supplierRows: ProductSupplierDraft[];
};

export const NEW_PRODUCT_DRAFT_KEY = "admin:new-product-draft:v1";

function createSupplierRow(supplierCost = "0"): ProductSupplierDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    supplierId: "",
    supplierCost,
  };
}

function createComponentRow(): ProductComponentDraft {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    childId: "",
    quantity: "1",
  };
}

export function NewProductForm({ categories, suppliers, currency, bundleProducts, onCancel }: NewProductFormProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [baseCost, setBaseCost] = useState("0");
  const [baseCostDirty, setBaseCostDirty] = useState(false);
  const [retailMarginPct, setRetailMarginPct] = useState("40");
  const [retailPriceInput, setRetailPriceInput] = useState("0");
  const [wholesaleMarginPct, setWholesaleMarginPct] = useState("20");
  const [wholesalePriceInput, setWholesalePriceInput] = useState("0");
  const [minWholesaleQty, setMinWholesaleQty] = useState("6");
  const [minStock, setMinStock] = useState("0");
  const [wholesaleEnabled, setWholesaleEnabled] = useState(false);
  const [retailPriceDirty, setRetailPriceDirty] = useState(false);
  const [wholesalePriceDirty, setWholesalePriceDirty] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [supplierRows, setSupplierRows] = useState<ProductSupplierDraft[]>(() => [createSupplierRow("0")]);
  const [isBundle, setIsBundle] = useState(false);
  const [componentRows, setComponentRows] = useState<ProductComponentDraft[]>(() => [createComponentRow()]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [mainImageUrls, setMainImageUrls] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      mainImageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [mainImageUrls]);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(NEW_PRODUCT_DRAFT_KEY);
      if (!rawDraft) {
        setDraftReady(true);
        return;
      }

      const draft = JSON.parse(rawDraft) as Partial<NewProductDraft>;
      setName(draft.name ?? "");
      setCode(draft.code ?? "");
      setDescription(draft.description ?? "");
      setSeoTitle(draft.seoTitle ?? "");
      setSeoDescription(draft.seoDescription ?? "");
      setBaseCost(draft.baseCost ?? "0");
      setRetailMarginPct(draft.retailMarginPct ?? "35");
      setRetailPriceInput(draft.retailPriceInput ?? "0");
      setWholesaleMarginPct(draft.wholesaleMarginPct ?? "20");
      setWholesalePriceInput(draft.wholesalePriceInput ?? "0");
      setMinWholesaleQty(draft.minWholesaleQty ?? "6");
      setWholesaleEnabled(draft.wholesaleEnabled ?? false);
      setRetailPriceDirty(draft.retailPriceDirty ?? false);
      setWholesalePriceDirty(draft.wholesalePriceDirty ?? false);
      setCategoryId(draft.categoryId ?? "");
      if (Array.isArray(draft.supplierRows) && draft.supplierRows.length > 0) {
        setSupplierRows(
          draft.supplierRows.map((row) => ({
            id: row.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
            supplierId: row.supplierId ?? "",
            supplierCost: row.supplierCost ?? draft.baseCost ?? "0",
          })),
        );
      } else if (typeof (draft as Partial<NewProductDraft> & { supplierId?: string }).supplierId === "string") {
        setSupplierRows([
          {
            ...createSupplierRow(draft.baseCost ?? "0"),
            supplierId: (draft as Partial<NewProductDraft> & { supplierId?: string }).supplierId ?? "",
          },
        ]);
      }
    } catch {
      window.localStorage.removeItem(NEW_PRODUCT_DRAFT_KEY);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    const draft: NewProductDraft = {
      name,
      code,
      description,
      seoTitle,
      seoDescription,
      baseCost,
      retailMarginPct,
      retailPriceInput,
      wholesaleMarginPct,
      wholesalePriceInput,
      minWholesaleQty,
      wholesaleEnabled,
      retailPriceDirty,
      wholesalePriceDirty,
      categoryId,
      supplierRows,
    };

    window.localStorage.setItem(NEW_PRODUCT_DRAFT_KEY, JSON.stringify(draft));
  }, [
    draftReady,
    name,
    code,
    description,
    seoTitle,
    seoDescription,
    baseCost,
    retailMarginPct,
    retailPriceInput,
    wholesaleMarginPct,
    wholesalePriceInput,
    minWholesaleQty,
    wholesaleEnabled,
    retailPriceDirty,
    wholesalePriceDirty,
    categoryId,
    supplierRows,
  ]);

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
      suggestedRetailLabel: formatMoney(suggestedRetail, currency),
      wholesale: formatMoney(finalWholesale, currency),
      suggestedWholesaleLabel: formatMoney(suggestedWholesale, currency),
      wholesaleProfitLabel: formatMoney(wholesaleProfit, currency),
      profitLabel: formatMoney(profit, currency),
      cost: formatMoney(cost, currency),
    };
  }, [baseCost, retailMarginPct, retailPriceInput, retailPriceDirty, wholesaleMarginPct, wholesalePriceInput, wholesalePriceDirty, currency, wholesaleEnabled]);

  // Por defecto el costo deja un 40% de margen sobre el precio (costo = precio * 0.6),
  // mientras el usuario no edite el costo manualmente.
  useEffect(() => {
    if (baseCostDirty) {
      return;
    }
    const price = retailPriceDirty ? Number(retailPriceInput) || 0 : 0;
    if (price <= 0) {
      return;
    }
    setBaseCost(String(Math.round(price * 0.6)));
  }, [retailPriceInput, retailPriceDirty, baseCostDirty]);

  // El % Detal es el margen sobre el precio: % = (precio - costo) / precio * 100.
  useEffect(() => {
    const price = retailPriceDirty ? Number(retailPriceInput) || 0 : 0;
    const cost = Number(baseCost) || 0;
    if (cost <= 0 || price <= 0) {
      return;
    }
    setRetailMarginPct(String(Math.round(((price - cost) / price) * 10000) / 100));
  }, [baseCost, retailPriceInput, retailPriceDirty]);

  // El % Mayor tambien es el margen sobre el precio mayorista.
  useEffect(() => {
    const price = wholesalePriceDirty ? Number(wholesalePriceInput) || 0 : 0;
    const cost = Number(baseCost) || 0;
    if (cost <= 0 || price <= 0) {
      return;
    }
    setWholesaleMarginPct(String(Math.round(((price - cost) / price) * 10000) / 100));
  }, [baseCost, wholesalePriceInput, wholesalePriceDirty]);

  const allImageUrls = useMemo(() => mainImageUrls, [mainImageUrls]);

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
    (!wholesaleEnabled || (Number(wholesaleMarginPct) >= 0 && pricing.finalWholesale > 0 && Number(minWholesaleQty) >= 1));

  // Pistas de lo que falta para poder avanzar/guardar.
  const step1Missing: string[] = [];
  if (name.trim().length < 2) step1Missing.push("nombre");
  const step2Missing: string[] = [];
  if (!(Number(baseCost) > 0)) step2Missing.push("costo de compra");
  if (!(pricing.finalRetail > 0)) step2Missing.push("precio final");
  if (wholesaleEnabled && !(pricing.finalWholesale > 0)) step2Missing.push("precio mayor");
  const currentMissing = currentStep === 1 ? step1Missing : currentStep === 2 ? step2Missing : [];
  const steps = [
    { id: 1, label: "Producto", icon: Package },
    { id: 2, label: "Precios y compra", icon: Banknote },
    { id: 3, label: "Inventario", icon: Boxes },
  ] as const;

  // El paso al que el usuario puede llegar como maximo segun lo que ya completo.
  const maxReachableStep = !step1Ready ? 1 : !step2Ready ? 2 : 3;
  const canGoToStep = (target: number) => target <= Math.max(currentStep, maxReachableStep);
  const goToStep = (target: number) => {
    if (canGoToStep(target)) {
      setCurrentStep(target);
    }
  };
  // Desde el paso 2 en adelante ya se puede guardar (lo del paso 3 es opcional).
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

    mainImageUrls.forEach((url) => URL.revokeObjectURL(url));
    setMainImageUrls(files.map((file) => URL.createObjectURL(file)));
  };

  const removeImageAt = (index: number) => {
    const nextFiles = selectedFiles.filter((_, i) => i !== index);
    syncSelectedFiles(nextFiles);
  };

  const addSupplierRow = () => {
    setSupplierRows((current) => [...current, createSupplierRow(baseCost || "0")]);
  };

  const removeSupplierRow = (rowId: string) => {
    setSupplierRows((current) => current.filter((row) => row.id !== rowId));
  };

  const updateSupplierRow = (rowId: string, values: Partial<Omit<ProductSupplierDraft, "id">>) => {
    setSupplierRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...values } : row)));
  };

  const addComponentRow = () => {
    setComponentRows((current) => [...current, createComponentRow()]);
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
        <form action={adminCreateProductAction} className="flex min-h-0 flex-1 flex-col">
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
                      setPhotoIndex(selectedFiles.length + dropped.length - 1);
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
                        setPhotoIndex(selectedFiles.length + files.length - 1);
                      }}
                    />
                    {allImageUrls.length > 0 ? (
                      <div className="group relative h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-slate-100">
                        <img
                          src={allImageUrls[safePhotoIndex]}
                          alt={`Foto ${safePhotoIndex + 1}`}
                          className="h-full w-full object-cover"
                        />
                        {/* + al centro (aparece al pasar el mouse) para agregar mas fotos */}
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
                        {/* X para quitar la foto visible */}
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
                      value={retailPriceDirty ? retailPriceInput : pricing.suggestedRetail}
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
                {/* Campos SEO ocultos temporalmente (se mantienen para no perder el dato/borrador) */}
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
                    value={retailPriceDirty ? retailPriceInput : pricing.suggestedRetail}
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
                    onValueChange={(raw) => {
                      setBaseCost(raw);
                      setBaseCostDirty(true);
                    }}
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
                        value={wholesalePriceDirty ? wholesalePriceInput : pricing.suggestedWholesale}
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
                ) : null}
                {!wholesaleEnabled ? (
                  <>
                    <input type="hidden" name="wholesaleMarginPct" value="0" />
                    <input type="hidden" name="wholesalePrice" value="0" />
                    <input type="hidden" name="minWholesaleQty" value="1" />
                  </>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 border-t pt-4">
                <label className="hidden">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Truck className="h-4 w-4 text-slate-500" />Proveedor principal</span>
                  <select name="legacySupplierId" className="hidden" value="" onChange={() => undefined}>
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
              <p className="rounded-lg border border-dashed border-[var(--line)] bg-slate-50/60 px-3 py-3 text-xs text-slate-500">
                El stock actual y los movimientos se gestionan desde Inventario.
              </p>
            </div>

            </div>

            <div className="shrink-0 space-y-2 border-t bg-white px-6 py-4">
              {currentMissing.length > 0 ? (
                <p className="text-right text-xs text-amber-600">
                  Falta: {currentMissing.join(", ")}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {currentStep > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCurrentStep((step) => Math.max(1, step - 1))}
                    >
                      ← Atras
                    </Button>
                  ) : onCancel ? (
                    <Button type="button" variant="outline" onClick={onCancel}>
                      Cancelar
                    </Button>
                  ) : (
                    <Link href="/admin/productos" className={buttonVariants({ variant: "outline" })}>
                      Cancelar
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {currentStep >= 2 ? <SaveProductButton disabled={!canSubmit} /> : null}
                  {currentStep < 3 ? (
                    <Button type="button" onClick={() => goToStep(currentStep + 1)} disabled={!canGoToStep(currentStep + 1)}>
                      Siguiente
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
        </form>
      </div>
    </div>
  );
}
