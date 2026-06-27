"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminDeletePurchaseOrderAction } from "@/app/actions/inventory-actions";

type PurchaseDeleteMenuItemProps = {
  onSelect: () => void;
};

/**
 * Solo el item del menú. El diálogo se renderiza aparte (fuera del
 * DropdownMenu) para evitar que las dos capas modales de Radix se bloqueen
 * mutuamente los eventos de puntero.
 */
export function PurchaseDeleteMenuItem({ onSelect }: PurchaseDeleteMenuItemProps) {
  return (
    <DropdownMenuItem
      onSelect={() => onSelect()}
      className="text-destructive focus:text-destructive"
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Eliminar compra
    </DropdownMenuItem>
  );
}

type PurchaseDeleteDialogProps = {
  orderId: string;
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PurchaseDeleteDialog({ orderId, code, open, onOpenChange }: PurchaseDeleteDialogProps) {
  const router = useRouter();
  const [keepInventoryMovements, setKeepInventoryMovements] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Resetea el estado cada vez que se abre el diálogo.
  React.useEffect(() => {
    if (open) {
      setKeepInventoryMovements(false);
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar la compra {code}</DialogTitle>
          <DialogDescription>
            {keepInventoryMovements
              ? "Se eliminará la orden, pero se conservarán los movimientos de inventario (el stock ingresado y sus cobros a proveedores)."
              : "Se revertirá el stock ingresado y se eliminarán los cobros a proveedores de esta compra."}
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={keepInventoryMovements}
            onChange={(event) => setKeepInventoryMovements(event.target.checked)}
          />
          <span>
            No eliminar los movimientos de inventario de esta orden
            <span className="block text-xs text-muted-foreground">
              Conserva el stock ingresado y los cobros a proveedores ligados a la compra.
            </span>
          </span>
        </label>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const result = await adminDeletePurchaseOrderAction(orderId, keepInventoryMovements);
                  if (result?.ok) {
                    onOpenChange(false);
                    router.refresh();
                  } else {
                    setError(result?.error ?? "No se pudo eliminar la compra.");
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "No se pudo eliminar la compra.");
                }
              });
            }}
          >
            {pending ? "Eliminando..." : "Eliminar compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
