"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AccountOption = {
  id: string;
  name: string;
};

type AccountMovementFormDialogProps = {
  open: boolean;
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
  accounts: AccountOption[];
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function AccountMovementFormDialog({ open, action, onClose, returnTo, accounts }: AccountMovementFormDialogProps) {
  const [type, setType] = React.useState<"IN" | "OUT" | "TRANSFER">("IN");
  const [amount, setAmount] = React.useState("");

  React.useEffect(() => {
    if (!open) setAmount("");
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo movimiento de cuenta"
      onClick={onClose}
    >
      <Card className="w-full max-w-lg rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Movimiento de cuenta</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ajustes manuales (ingreso/retiro) o traslados entre cuentas.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form action={action} className="space-y-4 px-4 py-4">
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Tipo</span>
              <select
                name="type"
                value={type}
                onChange={(event) => setType(event.target.value as "IN" | "OUT" | "TRANSFER")}
                className={cn(controlClassName, "appearance-none")}
              >
                <option value="IN">Ingreso manual</option>
                <option value="OUT">Retiro / salida manual</option>
                <option value="TRANSFER">Traslado entre cuentas</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Fecha</span>
              <Input type="date" name="movementDate" defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">{type === "TRANSFER" ? "Cuenta origen" : "Cuenta"}</span>
              <select name="accountId" required className={cn(controlClassName, "appearance-none")}>
                <option value="">Selecciona una cuenta</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            {type === "TRANSFER" ? (
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Cuenta destino</span>
                <select name="toAccountId" required className={cn(controlClassName, "appearance-none")}>
                  <option value="">Selecciona una cuenta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="hidden md:block" />
            )}

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Monto</span>
              <MoneyInput value={amount} onValueChange={setAmount} name="amount" />
            </label>

            <label className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-foreground">Nota</span>
              <Textarea rows={2} name="note" placeholder="Observaciones opcionales" />
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Registrar movimiento</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
