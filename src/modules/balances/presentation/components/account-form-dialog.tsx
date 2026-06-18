"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AccountBalance } from "@/modules/balances/domain/entities";

type AccountFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  initialValue?: AccountBalance | null;
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function AccountFormDialog({ open, mode, action, onClose, returnTo, initialValue }: AccountFormDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Nueva cuenta" : "Editar cuenta"}
      onClick={onClose}
    >
      <Card className="w-full max-w-lg rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {mode === "create" ? "Nueva cuenta" : "Editar cuenta"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Crea un medio de pago (Nequi1, Caja-1, Bancolombia-123) con su saldo inicial.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form action={action} className="space-y-4 px-4 py-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          {mode === "edit" && initialValue ? (
            <input type="hidden" name="accountId" value={initialValue.id} />
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Nombre</span>
              <Input name="name" required placeholder="Ej. Nequi1" defaultValue={initialValue?.name ?? ""} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Tipo</span>
              <select
                name="type"
                className={cn(controlClassName, "appearance-none")}
                defaultValue={initialValue?.type ?? "CASH"}
              >
                <option value="CASH">Efectivo / Caja</option>
                <option value="WALLET">Billetera (Nequi, Daviplata)</option>
                <option value="BANK">Banco</option>
                <option value="OTHER">Otro</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Numero / referencia</span>
              <Input name="reference" placeholder="Ej. 3001234567" defaultValue={initialValue?.reference ?? ""} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Saldo inicial</span>
              <Input
                name="openingBalance"
                type="number"
                step="0.01"
                defaultValue={initialValue?.openingBalance ?? 0}
              />
            </label>

            {mode === "edit" ? (
              <label className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  name="isActive"
                  value="true"
                  defaultChecked={initialValue?.isActive ?? true}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm text-foreground">Cuenta activa</span>
              </label>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">{mode === "create" ? "Crear cuenta" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
