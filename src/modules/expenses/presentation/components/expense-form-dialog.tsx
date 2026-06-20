"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

type Option = {
  id: string;
  name: string;
};

type ExpenseInitialValue = {
  expenseId: string;
  categoryId: string;
  accountId: string;
  amount: number;
  description: string | null;
  reference: string | null;
  expenseDate: string;
};

type ExpenseFormDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  categories: Option[];
  accounts: Option[];
  initialValue?: ExpenseInitialValue | null;
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function ExpenseFormDialog({
  open,
  mode,
  action,
  onClose,
  returnTo,
  categories,
  accounts,
  initialValue,
}: ExpenseFormDialogProps) {
  if (!open) {
    return null;
  }

  const hasCategories = categories.length > 0;
  const hasAccounts = accounts.length > 0;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Nuevo gasto" : "Editar gasto"}
      onClick={onClose}
    >
      <Card className="w-full max-w-lg rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {mode === "create" ? "Nuevo gasto" : "Editar gasto"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Registra un gasto (nomina, marketing, varios) y la cuenta de la que sale el dinero.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!hasCategories || !hasAccounts ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {!hasCategories ? <p>Primero crea al menos una categoria de gasto.</p> : null}
            {!hasAccounts ? <p>Primero crea al menos una cuenta activa en Balances &gt; Cuentas.</p> : null}
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Entendido
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-4 px-4 py-4">
            <input type="hidden" name="returnTo" value={returnTo} />
            {mode === "edit" && initialValue ? (
              <input type="hidden" name="expenseId" value={initialValue.expenseId} />
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Categoria</span>
                <select
                  name="categoryId"
                  required
                  className={cn(controlClassName, "appearance-none")}
                  defaultValue={initialValue?.categoryId ?? ""}
                >
                  <option value="" disabled>
                    Selecciona una categoria
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Cuenta (de donde sale)</span>
                <select
                  name="accountId"
                  required
                  className={cn(controlClassName, "appearance-none")}
                  defaultValue={initialValue?.accountId ?? ""}
                >
                  <option value="" disabled>
                    Selecciona una cuenta
                  </option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Monto</span>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0"
                  defaultValue={initialValue?.amount ?? ""}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Fecha</span>
                <DatePicker
                  name="expenseDate"
                  required
                  defaultValue={initialValue?.expenseDate ?? today()}
                />
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-foreground">Referencia (opcional)</span>
                <Input name="reference" placeholder="Ej. Factura 0012" defaultValue={initialValue?.reference ?? ""} />
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-foreground">Descripcion (opcional)</span>
                <textarea
                  name="description"
                  rows={3}
                  className={cn(controlClassName, "h-auto py-2 resize-none")}
                  placeholder="Detalle del gasto"
                  defaultValue={initialValue?.description ?? ""}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">{mode === "create" ? "Registrar gasto" : "Guardar cambios"}</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
