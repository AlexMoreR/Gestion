"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { adminDeletePurchaseOrderAction } from "@/app/actions/inventory-actions";

type PurchaseDeleteMenuItemProps = {
  orderId: string;
  code: string;
};

export function PurchaseDeleteMenuItem({ orderId, code }: PurchaseDeleteMenuItemProps) {
  const [pending, startTransition] = React.useTransition();

  return (
    <DropdownMenuItem
      disabled={pending}
      onSelect={(event) => {
        event.preventDefault();
        const ok = window.confirm(
          `¿Eliminar la compra ${code}? Se revertirá el stock ingresado y se eliminarán los cobros a proveedores de esta compra.`,
        );
        if (ok) {
          startTransition(() => {
            void adminDeletePurchaseOrderAction(orderId);
          });
        }
      }}
      className="text-destructive focus:text-destructive"
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {pending ? "Eliminando..." : "Eliminar compra"}
    </DropdownMenuItem>
  );
}
