"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ExpenseCategoryWithUsage } from "@/modules/expenses/domain/entities";

type ExpenseCategoryFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  initialValue?: ExpenseCategoryWithUsage | null;
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ExpenseCategoryFormDialog({
  open,
  mode,
  action,
  onClose,
  returnTo,
  initialValue,
}: ExpenseCategoryFormDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Nueva categoria" : "Editar categoria"}
      onClick={onClose}
    >
      <Card className="w-full max-w-md rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {mode === "create" ? "Nueva categoria" : "Editar categoria"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Agrupa tus gastos (Nomina, Marketing, Varios, etc.).
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form action={action} className="space-y-4 px-4 py-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          {mode === "edit" && initialValue ? (
            <input type="hidden" name="categoryId" value={initialValue.id} />
          ) : null}

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Nombre</span>
            <Input name="name" required placeholder="Ej. Nomina" defaultValue={initialValue?.name ?? ""} />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Descripcion (opcional)</span>
            <textarea
              name="description"
              rows={2}
              className={cn(controlClassName, "h-auto py-2 resize-none")}
              placeholder="Para que se usa esta categoria"
              defaultValue={initialValue?.description ?? ""}
            />
          </label>

          {mode === "edit" ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isActive"
                value="true"
                defaultChecked={initialValue?.isActive ?? true}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm text-foreground">Categoria activa</span>
            </label>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">{mode === "create" ? "Crear categoria" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
