"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminUpdateSupplierAction } from "@/app/actions/catalog-actions";

type SupplierEditButtonProps = {
  supplier: {
    id: string;
    name: string;
    displayName: string | null;
    type: "MANUFACTURER" | "SHIPPING";
    email: string | null;
    phone: string | null;
  };
};

export function SupplierEditButton({ supplier }: SupplierEditButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Editar proveedor"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Editar ${supplier.name}`}
          onClick={() => setOpen(false)}
        >
          <Card
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Editar proveedor</h2>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-8 w-8"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form action={adminUpdateSupplierAction} className="space-y-3">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Proveedor</span>
                <Input name="name" defaultValue={supplier.name} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Nombre</span>
                <Input name="displayName" defaultValue={supplier.displayName ?? ""} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Tipo de proveedor</span>
                <select
                  name="type"
                  defaultValue={supplier.type}
                  className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="MANUFACTURER">Fabricante</option>
                  <option value="SHIPPING">Envios</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Correo</span>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={supplier.email ?? ""}
                    placeholder="ventas@proveedor.com"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Telefono</span>
                  <Input name="phone" defaultValue={supplier.phone ?? ""} placeholder="+57 300..." />
                </label>
              </div>
              <Button type="submit" className="h-10 w-full">
                Guardar cambios
              </Button>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
