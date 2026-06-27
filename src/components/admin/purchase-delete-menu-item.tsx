"use client";

import * as React from "react";
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
  orderId: string;
  code: string;
};

export function PurchaseDeleteMenuItem({ orderId, code }: PurchaseDeleteMenuItemProps) {
  const [open, setOpen] = React.useState(false);
  const [keepInventoryMovements, setKeepInventoryMovements] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <>
      <DropdownMenuItem
        disabled={pending}
        onSelect={(event) => {
          event.preventDefault();
          setKeepInventoryMovements(false);
          setOpen(true);
        }}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Eliminar compra
      </DropdownMenuItem>

      <Dialog open={open} onOpenChange={setOpen}>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                startTransition(() => {
                  void adminDeletePurchaseOrderAction(orderId, keepInventoryMovements);
                });
              }}
            >
              {pending ? "Eliminando..." : "Eliminar compra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
