"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ProductSupplierDraft = {
  id: string;
  supplierId: string;
  supplierCost: string;
};

type SupplierOption = {
  id: string;
  name: string;
};

type ProductSuppliersFieldProps = {
  suppliers: SupplierOption[];
  rows: ProductSupplierDraft[];
  currency: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, values: Partial<Omit<ProductSupplierDraft, "id">>) => void;
};

export function ProductSuppliersField({
  suppliers,
  rows,
  currency,
  onAdd,
  onRemove,
  onChange,
}: ProductSuppliersFieldProps) {
  const selectedSupplierIds = new Set(rows.map((row) => row.supplierId).filter(Boolean));

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Proveedores</h3>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Agregar proveedor
        </Button>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="grid gap-2 rounded-lg border border-[var(--line)] bg-slate-50/60 p-3 md:grid-cols-[minmax(0,1fr)_11rem_2rem]"
            >
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">
                  {index === 0 ? "Proveedor principal" : `Proveedor ${index + 1}`}
                </span>
                <select
                  name="supplierIds"
                  className="field-select"
                  value={row.supplierId}
                  onChange={(event) => onChange(row.id, { supplierId: event.target.value })}
                >
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.map((supplier) => {
                    const disabled = selectedSupplierIds.has(supplier.id) && supplier.id !== row.supplierId;
                    return (
                      <option key={supplier.id} value={supplier.id} disabled={disabled}>
                        {supplier.name}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Compra ({currency})</span>
                <Input
                  name="supplierCosts"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={row.supplierCost}
                  onChange={(event) => onChange(row.id, { supplierCost: event.target.value })}
                />
              </label>

              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-slate-500"
                  onClick={() => onRemove(row.id)}
                  aria-label="Quitar proveedor"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--line)] bg-slate-50/60 px-3 py-4 text-sm text-slate-500">
          Sin proveedores asignados.
        </p>
      )}
    </div>
  );
}
