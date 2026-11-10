"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, MoreHorizontal, PackageCheck, Pencil } from "lucide-react";
import { adminCancelOrderAction, adminUpdateOrderStatusAction } from "@/app/actions/orders-actions";
import { adminUpdateOrderItemsFulfillmentAction } from "@/app/actions/order-item-actions";
import { Button } from "@/components/ui/button";
import { MotivoRetroactivoField } from "@/components/admin/motivo-retroactivo-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CANCEL_BLOCK_DISPATCH,
  CANCEL_NOTES_MAX,
  CANCEL_OTHER_MAX,
  CANCEL_OTHER_MIN,
  CANCEL_REASONS,
} from "@/lib/order-cancellation";
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
  // Cuadro "Cancelar orden": OF sin recibir (no se cancelan solas), despacho vivo (bloquea) y cobros (aviso).
  openOfs?: { code: string; supplierName: string; products: string; href: string }[];
  hasActiveDispatch?: boolean;
  hasPayments?: boolean;
};

const STATUS_ACTIONS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  DRAFT: { status: "RELEASED", label: "Liberar" },
  RELEASED: { status: "IN_PRODUCTION", label: "Iniciar produccion" },
  READY_FOR_DISPATCH: { status: "DISPATCHED", label: "Marcar despachada" },
  DISPATCHED: { status: "COMPLETED", label: "Cerrar orden" },
};

export function OrderActionsMenu({
  orderId,
  status,
  isPurchase = false,
  returnTo,
  items,
  orderDate,
  openOfs = [],
  hasActiveDispatch = false,
  hasPayments = false,
}: OrderActionsMenuProps) {
  const statusAction = STATUS_ACTIONS[status];
  const canCancel = status !== "CANCELLED" && (isPurchase || status !== "COMPLETED");
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonText, setCancelReasonText] = useState("");
  const cancelReady =
    !hasActiveDispatch &&
    cancelReason !== "" &&
    (cancelReason !== "OTRO" || cancelReasonText.trim().length >= CANCEL_OTHER_MIN);
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
              <label htmlFor="order-cancel-reason" className="text-sm font-medium text-foreground">
                Motivo
              </label>
              <select
                id="order-cancel-reason"
                name="cancelReason"
                required
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="" disabled>
                  Elige el motivo
                </option>
                {CANCEL_REASONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {cancelReason === "OTRO" ? (
              <div className="space-y-1.5">
                <label htmlFor="order-cancel-reason-text" className="text-sm font-medium text-foreground">
                  ¿Cuál es el motivo?
                </label>
                <Input
                  id="order-cancel-reason-text"
                  name="cancelReasonText"
                  value={cancelReasonText}
                  onChange={(event) => setCancelReasonText(event.target.value)}
                  required
                  minLength={CANCEL_OTHER_MIN}
                  maxLength={CANCEL_OTHER_MAX}
                  placeholder={`Mínimo ${CANCEL_OTHER_MIN} letras`}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label htmlFor="order-cancel-notes" className="text-sm font-medium text-foreground">
                Notas
              </label>
              <Textarea
                id="order-cancel-notes"
                name="cancelNotes"
                rows={2}
                maxLength={CANCEL_NOTES_MAX}
                placeholder="Opcional"
              />
              <p className="text-xs text-muted-foreground">
                {isPurchase
                  ? "La compra queda anulada con sus pagos visibles. El stock no cambia."
                  : "El motivo y las notas quedan en el historial de la orden."}
              </p>
            </div>
            {hasActiveDispatch ? (
              <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {CANCEL_BLOCK_DISPATCH} (botón junto a este menú; si aún no salió, cancela el despacho primero).
                </span>
              </p>
            ) : null}
            {hasPayments ? (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Esta venta tiene cobros registrados: revísalos a mano; cancelar no cambia la plata.</span>
              </p>
            ) : null}
            {openOfs.length > 0 ? (
              <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                <p className="font-medium">
                  OF sin recibir: no se cancelan solas. Avísale a la proveedora a mano.
                </p>
                <ul className="space-y-1">
                  {openOfs.map((of) => (
                    <li key={of.code} className="break-words">
                      <Link href={of.href} target="_blank" rel="noreferrer" className="font-medium underline">
                        {of.code}
                      </Link>{" "}
                      · {of.supplierName} · {of.products}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                Volver
              </Button>
              <Button type="submit" variant="destructive" disabled={!cancelReady}>
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
