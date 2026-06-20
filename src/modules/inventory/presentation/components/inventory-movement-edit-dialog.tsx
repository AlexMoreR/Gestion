"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import type { InventoryMovementRow, InventoryMovementType } from "@/modules/inventory/domain/entities";

type InventoryMovementEditDialogProps = {
  open: boolean;
  movement: InventoryMovementRow | null;
  action: (formData: FormData) => Promise<void>;
  onClose: () => void;
  returnTo: string;
};

const controlClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function toInputDate(value: Date): string {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function InventoryMovementEditDialog({
  open,
  movement,
  action,
  onClose,
  returnTo,
}: InventoryMovementEditDialogProps) {
  const [type, setType] = React.useState<InventoryMovementType>("IN");

  React.useEffect(() => {
    if (open && movement) {
      setType(movement.type);
    }
  }, [open, movement]);

  if (!open || !movement) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Editar movimiento"
      onClick={onClose}
    >
      <Card className="w-full max-w-lg rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between px-4 py-3">
          <h3 className="text-base font-semibold text-foreground">Editar movimiento</h3>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form action={action} className="space-y-4 px-4 pb-4 pt-1">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="movementId" value={movement.id} />

          <div>
            <p className="text-sm font-medium text-foreground">{movement.productName}</p>
            {movement.productCode ? (
              <p className="text-xs text-muted-foreground">{movement.productCode}</p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Tipo</span>
              <select
                name="type"
                value={type}
                onChange={(event) => setType(event.target.value as InventoryMovementType)}
                className={cn(controlClassName, "appearance-none")}
              >
                <option value="IN">Entrada (sumar)</option>
                <option value="OUT">Salida (restar)</option>
                <option value="ADJUSTMENT">Ajuste (conteo)</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Cant</span>
              <Input
                name="quantity"
                type="number"
                step="1"
                min="0"
                required
                defaultValue={Math.abs(movement.change)}
              />
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Fecha</span>
            <DatePicker name="movementDate" required defaultValue={toInputDate(movement.movementDate)} />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Nota (opcional)</span>
            <textarea
              name="note"
              rows={2}
              defaultValue={movement.note ?? ""}
              className={cn(controlClassName, "h-auto resize-none py-2")}
              placeholder="Ej. Compra a proveedor, merma, conteo fisico"
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Guardar cambios</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
