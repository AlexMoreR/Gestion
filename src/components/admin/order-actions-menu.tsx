"use client";

import { MoreHorizontal } from "lucide-react";
import { adminCancelOrderAction, adminUpdateOrderStatusAction } from "@/app/actions/orders-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OrderStatus =
  | "DRAFT"
  | "RELEASED"
  | "IN_PRODUCTION"
  | "READY_FOR_DISPATCH"
  | "DISPATCHED"
  | "COMPLETED"
  | "CANCELLED";

type OrderActionsMenuProps = {
  orderId: string;
  status: OrderStatus;
  returnTo: string;
};

const STATUS_ACTIONS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  DRAFT: { status: "RELEASED", label: "Liberar" },
  RELEASED: { status: "IN_PRODUCTION", label: "Iniciar produccion" },
  READY_FOR_DISPATCH: { status: "DISPATCHED", label: "Marcar despachada" },
  DISPATCHED: { status: "COMPLETED", label: "Cerrar orden" },
};

export function OrderActionsMenu({ orderId, status, returnTo }: OrderActionsMenuProps) {
  const statusAction = STATUS_ACTIONS[status];
  const canCancel = status !== "COMPLETED" && status !== "CANCELLED";

  if (!statusAction && !canCancel) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Acciones de la orden">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {statusAction ? (
          <form action={adminUpdateOrderStatusAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="status" value={statusAction.status} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                {statusAction.label}
              </button>
            </DropdownMenuItem>
          </form>
        ) : null}
        {statusAction && canCancel ? <DropdownMenuSeparator /> : null}
        {canCancel ? (
          <form action={adminCancelOrderAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="note" value="Cancelada desde detalle" />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-destructive focus:text-destructive">
                Cancelar
              </button>
            </DropdownMenuItem>
          </form>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
