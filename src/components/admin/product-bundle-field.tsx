"use client";

import { Plus, Trash2, X } from "lucide-react";
import { ProductSearchSelect } from "@/components/admin/product-search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

export type ProductComponentDraft = {
  id: string;
  childId: string;
  quantity: string;
  alternateIds?: string[]; // piezas que pueden ir en su lugar (ej. otro butaco)
};

export type BundleProductOption = {
  id: string;
  name: string;
  code: string | null;
  price: number;
};

type ProductBundleFieldProps = {
  isBundle: boolean;
  onToggle: (value: boolean) => void;
  products: BundleProductOption[];
  rows: ProductComponentDraft[];
  currency: SupportedCurrencyCode;
  comboPrice: number;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, values: Partial<Omit<ProductComponentDraft, "id">>) => void;
};

export function ProductBundleField({
  isBundle,
  onToggle,
  products,
  rows,
  currency,
  comboPrice,
  onAdd,
  onRemove,
  onChange,
}: ProductBundleFieldProps) {
  const selectedChildIds = new Set(rows.map((row) => row.childId).filter(Boolean));
  const productById = new Map(products.map((product) => [product.id, product]));

  const componentsTotal = rows.reduce((sum, row) => {
    const product = productById.get(row.childId);
    const quantity = Number(row.quantity) || 0;
    return sum + (product ? product.price * quantity : 0);
  }, 0);
  // Diferencia = lo que costarian los componentes por separado menos el precio del
  // combo. Positivo => el cliente ahorra al comprar el combo.
  const difference = componentsTotal - comboPrice;

  return (
    <div className="space-y-4">
      {/* Bandera enviada al servidor */}
      <input type="hidden" name="isBundle" value={isBundle ? "true" : "false"} />

      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 accent-slate-900"
          checked={isBundle}
          onChange={(event) => onToggle(event.target.checked)}
        />
        Habilitar combo (se arma con otros productos)
      </label>

      {isBundle ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Componentes</h3>
              <p className="text-xs text-slate-500">Elige los productos que forman el combo y su cantidad.</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" />
              Agregar componente
            </Button>
          </div>

          {rows.length > 0 ? (
            <div className="space-y-2">
              {rows.map((row) => {
                const product = productById.get(row.childId);
                const alternateIds = (row.alternateIds ?? []).filter((id) => id !== row.childId);
                return (
                  <div
                    key={row.id}
                    className="grid gap-2 rounded-lg border border-[var(--line)] bg-slate-50/60 p-3 md:grid-cols-[minmax(0,1fr)_7rem_2rem]"
                  >
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-600">Producto</span>
                      <ProductSearchSelect
                        products={products}
                        value={row.childId}
                        onChange={(productId) => onChange(row.id, { childId: productId })}
                        disabledIds={selectedChildIds}
                      />
                      {product ? (
                        <span className="text-[11px] text-slate-500">
                          Precio unitario: {formatMoney(product.price, currency)}
                        </span>
                      ) : null}
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-600">Cantidad</span>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={row.quantity}
                        onChange={(event) => onChange(row.id, { quantity: event.target.value })}
                      />
                    </label>

                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-slate-500"
                        onClick={() => onRemove(row.id)}
                        aria-label="Quitar componente"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {row.childId ? (
                      <div className="space-y-1.5 md:col-span-3">
                        <span className="text-xs font-medium text-slate-600">
                          Alternas (si no hay esta pieza, sale una de estas)
                        </span>
                        {alternateIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {alternateIds.map((alternateId) => {
                              const alternate = productById.get(alternateId);
                              return (
                                <span
                                  key={alternateId}
                                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs text-slate-700"
                                >
                                  <span className="truncate">
                                    {alternate ? `${alternate.code || "SIN-CODIGO"} - ${alternate.name}` : "Producto"}
                                  </span>
                                  <button
                                    type="button"
                                    className="text-slate-500 hover:text-slate-900"
                                    onClick={() =>
                                      onChange(row.id, { alternateIds: alternateIds.filter((id) => id !== alternateId) })
                                    }
                                    aria-label="Quitar alterna"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                        <ProductSearchSelect
                          products={products}
                          value=""
                          placeholder="Agregar alterna"
                          onChange={(productId) =>
                            onChange(row.id, { alternateIds: [...alternateIds, productId] })
                          }
                          disabledIds={new Set([row.childId, ...alternateIds])}
                        />
                      </div>
                    ) : null}

                    {/* Campos enviados al servidor (solo filas con producto) */}
                    {row.childId ? (
                      <>
                        <input type="hidden" name="componentProductIds" value={row.childId} />
                        <input type="hidden" name="componentQuantities" value={Number(row.quantity) || 0} />
                        {alternateIds.map((alternateId) => (
                          <input
                            key={alternateId}
                            type="hidden"
                            name="componentAlternates"
                            value={`${row.childId}:${alternateId}`}
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--line)] bg-slate-50/60 px-3 py-4 text-sm text-slate-500">
              Sin componentes. Agrega al menos un producto.
            </p>
          )}

          <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-slate-50/60 px-3 py-2">
            <span className="text-xs font-medium text-slate-600">Diferencia (componentes − precio combo)</span>
            <span
              className={`text-sm font-semibold ${
                difference > 0 ? "text-emerald-600" : difference < 0 ? "text-destructive" : "text-slate-900"
              }`}
            >
              {formatMoney(difference, currency)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
