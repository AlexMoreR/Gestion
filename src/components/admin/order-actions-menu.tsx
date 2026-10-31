"use client";

import { useState } from "react";
import { MoreHorizontal, PackageCheck, Pencil } from "lucide-react";
import { adminCancelOrderAction, adminUpdateOrderStatusAction } from "@/app/actions/orders-actions";
import { adminUpdateOrderItemsFulfillmentAction } from "@/app/actions/order-item-actions";
import { Button } from "@/components/ui/button";
import { MotivoRetroactivoField } from "@/components/admin/motivo-retroactivo-field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type OrderEditItem = {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  fulfillmentMode: "STOCK" | "MANUFACTURE" | "MIXED";
};

type OrderActionsMenuProps = {
  orderId: string;
  status: OrderStatus;
  // Una compra completada se puede anular (con motivo); una venta completada no.
  isPurchase?: boolean;
  returnTo: string;
  items: OrderEditItem[];
  // Fecha actual de la orden (YYYY-MM-DD) para precargar el campo de edicion.
  orderDate: string;
};

const STATUS_ACTIONS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  DRAFT: { status: "RELEASED", label: "Liberar" },
  RELEASED: { status: "IN_PRODUCTION", label: "Iniciar produccion" },
  READY_FOR_DISPATCH: { status: "DISPATCHED", label: "Marcar despachada" },
  DISPATCHED: { status: "COMPLETED", label: "Cerrar orden" },
};

export function OrderActionsMenu({ orderId, status, isPurchase = false, returnTo, items, orderDate }: OrderActionsMenuProps) {
  const statusAction = STATUS_ACTIONS[status];
  const canCancel = status !== "CANCELLED" && (isPurchase || status !== "COMPLETED");
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Modo elegido por producto dentro del modal (controlado).
  const [modes, setModes] = useState<Record<string, "STOCK" | "MANUFACTURE">>({});
  // Fecha de la orden dentro del modal (controlada).
  const [date, setDate] = useState(orderDate);

  const openEdit = () => {
    setModes(
      Object.fromEntries(
        items.map((item) => [item.id, item.fulfillmentMode === "MANUFACTURE" ? "MANUFACTURE" : "STOCK"]),
      ),
    );
    setDate(orderDate);
    setEditOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Acciones de la orden">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={openEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar orden
          </DropdownMenuItem>
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
          {canCancel ? <DropdownMenuSeparator /> : null}
          {canCancel ? (
            <DropdownMenuItem
              onSelect={() => setCancelOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              Cancelar
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar orden</DialogTitle>
          </DialogHeader>
          <form action={adminCancelOrderAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="orderId" value={orderId} />
            <div className="space-y-1.5">
              <label htmlFor="order-cancel-note" className="text-sm font-medium text-foreground">
                Motivo
              </label>
              <textarea
                id="order-cancel-note"
                name="note"
                required
                rows={3}
                placeholder="Por qué se cancela"
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <p className="text-xs text-muted-foreground">
                {isPurchase
                  ? "La compra queda anulada con sus pagos visibles. El stock no cambia."
                  : "El motivo queda en el historial de la orden."}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                Volver
              </Button>
              <Button type="submit" variant="destructive">
                Cancelar orden
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(open) => (open ? null : setEditOpen(false))}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar orden</DialogTitle>
          </DialogHeader>

          <form action={adminUpdateOrderItemsFulfillmentAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="orderId" value={orderId} />

            <div className="space-y-1.5">
              <label htmlFor="order-edit-date" className="text-sm font-medium text-foreground">
                Fecha de la orden
              </label>
              <input
                id="order-edit-date"
                name="orderDate"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <p className="text-xs text-muted-foreground">
                Tambien actualiza la fecha de los cobros de la venta para que concuerden.
              </p>
              <MotivoRetroactivoField fecha={date} fechaOriginal={orderDate} className="mt-2" />
            </div>

            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.code ? `${item.code} · ` : ""}x{item.quantity}
                    </p>
                  </div>
                  <input type="hidden" name="orderItemId" value={item.id} />
                  <select
                    name="fulfillmentMode"
                    value={modes[item.id] ?? "STOCK"}
                    onChange={(event) =>
                      setModes((current) => ({
                        ...current,
                        [item.id]: event.target.value === "MANUFACTURE" ? "MANUFACTURE" : "STOCK",
                      }))
                    }
                    className="h-8 shrink-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="STOCK">Stock</option>
                    <option value="MANUFACTURE">Fabricación</option>
                  </select>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                <PackageCheck className="mr-1.5 h-4 w-4" />
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
