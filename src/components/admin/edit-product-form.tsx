"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  Boxes,
  CircleDollarSign,
  Hash,
  ImagePlus,
  Package2,
  Percent,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { adminUpdateProductAction } from "@/app/actions/product-actions";
import { ProductFormStepper } from "@/components/admin/product-form-stepper";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { calculateRetailPrice, calculateWholesalePrice } from "@/lib/pricing";

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
  baseCost: number;
  retailMarginPct: number;
  wholesaleMarginPct: number;
  minWholesaleQty: number;
  categoryId: string | null;
  supplierId: string | null;
  imageUrls: string[];
};

type EditProductFormProps = {
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  currency: SupportedCurrencyCode;
  initialData: EditProductInitialData;
};

export function EditProductForm({
  categories,
  suppliers,
  currency,
  initialData,
}: EditProductFormProps) {
  const [name, setName] = useState(initialData.name);
  const [code, setCode] = useState(initialData.code ?? "");
  const [description, setDescription] = useState(initialData.description ?? "");
  const [baseCost, setBaseCost] = useState(initialData.baseCost.toFixed(2));
  const [retailMarginPct, setRetailMarginPct] = useState(initialData.retailMarginPct.toFixed(2));
  const [wholesaleMarginPct, setWholesaleMarginPct] = useState(initialData.wholesaleMarginPct.toFixed(2));
  const [minWholesaleQty, setMinWholesaleQty] = useState(String(initialData.minWholesaleQty));
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [newImageUrls, setNewImageUrls] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState(initialData.imageUrls);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      newImageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [newImageUrls]);

  const previewPrices = useMemo(() => {
    const cost = Number(baseCost) || 0;
    const retailMargin = Number(retailMarginPct) || 0;
    const wholesaleMargin = Number(wholesaleMarginPct) || 0;

    const retail = calculateRetailPrice(cost, retailMargin);
    const wholesale = calculateWholesalePrice(cost, wholesaleMargin);

    return {
      retail: formatMoney(retail, currency),
      wholesale: formatMoney(wholesale, currency),
      cost: formatMoney(cost, currency),
    };
  }, [baseCost, retailMarginPct, wholesaleMarginPct, currency]);

  const allImageUrls = useMemo(
    () => [...existingImageUrls, ...newImageUrls],
    [existingImageUrls, newImageUrls],
  );
  const previewImageUrl = allImageUrls[0] ?? null;
  const step1Ready = name.trim().length >= 2 && allImageUrls.length > 0;
  const step2Ready =
    Number(baseCost) > 0 &&
    Number(retailMarginPct) >= 0 &&
    Number(wholesaleMarginPct) >= 0 &&
    Number(minWholesaleQty) >= 1;
  const activeStep = !step1Ready ? 1 : !step2Ready ? 2 : 3;
  const steps = [
    { id: 1, label: "Producto" },
    { id: 2, label: "Precios" },
    { id: 3, label: "Inventario" },
  ] as const;

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

  return (
    <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)] xl:gap-8">
      <aside className="space-y-4 xl:sticky xl:top-8 xl:h-fit xl:space-y-5">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
            <div className="relative flex h-36 items-center justify-center bg-slate-100">
              {previewImageUrl ? (
                <img src={previewImageUrl} alt="Vista previa" className="h-full w-full object-cover" />
              ) : (
                <p className="text-xs text-slate-500">Sin imagen principal</p>
              )}
              <span className="absolute right-2 top-2 rounded-full border border-[var(--line)] bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {code.trim() || "SKU"}
              </span>
            </div>
            <div className="space-y-1.5 border-t border-[var(--line)] bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">{name.trim() || "Producto sin nombre"}</p>
              {description.trim() ? (
                <p className="line-clamp-2 text-xs text-slate-500">{description.trim()}</p>
              ) : (
                <p className="text-xs text-slate-400">Agrega descripcion para completar la ficha.</p>
              )}
              <p className="text-lg font-semibold tracking-tight text-slate-900">{previewPrices.retail}</p>
              <p className="text-xs text-slate-600">
                Mayorista: {previewPrices.wholesale} (min {minWholesaleQty || "1"} uds)
              </p>
            </div>
          </div>
        </div>

      </aside>

      <Card className="space-y-6 overflow-hidden px-4 pb-4 pt-0 sm:space-y-7 sm:px-6 sm:pb-6">
        <ProductFormStepper steps={steps} activeStep={activeStep} />

        <form action={adminUpdateProductAction} className="space-y-7">
          <input type="hidden" name="productId" value={initialData.id} />
          <input type="hidden" name="existingImages" value={existingImageUrls.join("\n")} />

          <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 md:col-span-2">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Package2 className="h-3.5 w-3.5 text-slate-500" />
                  Nombre
                </span>
                <Input name="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block space-y-1.5 md:col-span-2">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <AlignLeft className="h-3.5 w-3.5 text-slate-500" />
                  Descripcion
                </span>
                <textarea
                  name="description"
                  rows={4}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[#d1d5db80]"
                  placeholder="Descripcion corta del producto"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <div className="block space-y-1.5 md:col-span-2">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <ImagePlus className="h-3.5 w-3.5 text-slate-500" />
                  Multimedia
                </span>
                <div
                  className={`space-y-3 rounded-xl border border-dashed p-4 transition ${
                    dragActive
                      ? "border-slate-400 bg-slate-100/80"
                      : "border-[var(--line-strong)] bg-slate-50/60"
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
                    }}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Agregar imagenes
                    </button>
                  </div>
                  {allImageUrls.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {allImageUrls.map((url, index) => (
                        <div
                          key={`${url}-${index}`}
                          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-slate-100"
                        >
                          <img src={url} alt={`Imagen ${index + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImageAt(index);
                            }}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                            aria-label={`Eliminar imagen ${index + 1}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-red-600">
                      Debes mantener al menos una imagen para guardar el producto.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
            <div className="space-y-1 border-b border-[var(--line)] pb-3">
              <h2 className="text-sm font-semibold text-slate-900">Precios</h2>
              <p className="text-xs text-slate-500">Ajusta costo y margenes actuales.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <CircleDollarSign className="h-3.5 w-3.5 text-slate-500" />
                  Costo compra ({currency})
                </span>
                <Input
                  name="baseCost"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={baseCost}
                  onChange={(e) => setBaseCost(e.target.value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Percent className="h-3.5 w-3.5 text-slate-500" />
                  Margen detal (%)
                </span>
                <Input
                  name="retailMarginPct"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={retailMarginPct}
                  onChange={(e) => setRetailMarginPct(e.target.value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Percent className="h-3.5 w-3.5 text-slate-500" />
                  Margen mayor (%)
                </span>
                <Input
                  name="wholesaleMarginPct"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={wholesaleMarginPct}
                  onChange={(e) => setWholesaleMarginPct(e.target.value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Boxes className="h-3.5 w-3.5 text-slate-500" />
                  Min. unidades mayor
                </span>
                <Input
                  name="minWholesaleQty"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={minWholesaleQty}
                  onChange={(e) => setMinWholesaleQty(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
            <div className="space-y-1 border-b border-[var(--line)] pb-3">
              <h2 className="text-sm font-semibold text-slate-900">Inventario</h2>
              <p className="text-xs text-slate-500">Mantiene categoria y proveedor principal.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Hash className="h-3.5 w-3.5 text-slate-500" />
                  Codigo
                </span>
                <Input name="code" placeholder="Ej. CAM-001" value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Tag className="h-3.5 w-3.5 text-slate-500" />
                  Categoria
                </span>
                <select name="categoryId" className="field-select" defaultValue={initialData.categoryId ?? ""}>
                  <option value="">Sin categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Truck className="h-3.5 w-3.5 text-slate-500" />
                  Proveedor principal
                </span>
                <select name="supplierId" className="field-select" defaultValue={initialData.supplierId ?? ""}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
            <Link
              href="/admin/productos/new"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Crear nuevo producto
            </Link>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
                disabled={allImageUrls.length === 0}
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
