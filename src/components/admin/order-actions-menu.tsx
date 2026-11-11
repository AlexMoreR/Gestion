"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, MoreHorizontal, PackageCheck, Pencil, RotateCcw, Wallet } from "lucide-react";
import {
  adminCancelOrderAction,
  adminReactivateOrderAction,
  adminUpdateOrderStatusAction,
} from "@/app/actions/orders-actions";
import { adminUpdateOrderItemsFulfillmentAction } from "@/app/actions/order-item-actions";
import { Button } from "@/components/ui/button";
import { MotivoRetroactivoField } from "@/components/admin/motivo-retroactivo-field";
import { ChangeItemColorDialog } from "@/components/admin/change-item-color-dialog";
import { ChangeItemImageDialog } from "@/components/admin/change-item-image-dialog";
import type { ParteElegida, ParteParaCotizar } from "@/lib/product-parts";
import {
  ChangePaymentMethodDialog,
  type ChangePaymentMethodProps,
} from "@/modules/ventas/presentation/change-payment-method-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CANCEL_BLOCK_DISPATCH,
  CANCEL_NOTES_MAX,
  CANCEL_OTHER_MAX,
  CANCEL_OTHER_MIN,
  CANCEL_REASONS,
  REACTIVATE_MAX,
  REACTIVATE_MIN,
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
  /** Color e imagen de la línea: se cambian desde este cuadro (cada uno se guarda con su propio botón). */
  color?: string;
  canChangeColor?: boolean;
  imagenManual?: string | null;
  imagenCatalogo?: string | null;
  partesDef?: ParteParaCotizar[];
  partesElegidas?: ParteElegida[];
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
  // "Cambiar forma de pago" (solo en ventas y con permiso de Ventas o Cotizaciones).
  paymentMethod?: ChangePaymentMethodProps | null;
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
  paymentMethod = null,
}: OrderActionsMenuProps) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const statusAction = STATUS_ACTIONS[status];
  const canCancel = status !== "CANCELLED" && (isPurchase || status !== "COMPLETED");
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Reactivar: solo una orden de venta cancelada (el servidor revisa además que la venta no esté cancelada).
  const canReactivate = status === "CANCELLED" && !isPurchase;
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [reactivateReason, setReactivateReason] = useState("");
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
  // Producto cuyo cuadro de color o de imagen está abierto (encima de "Editar orden").
  // Se guarda el valor al abrir: al guardarse uno nuevo el cuadro se cierra solo.
  const [colorAbierto, setColorAbierto] = useState<{ id: string; color: string } | null>(null);
  const [imagenAbierta, setImagenAbierta] = useState<{ id: string; imagen: string | null } | null>(null);
  const colorItem = items.find((item) => item.id === colorAbierto?.id && (item.color ?? "") === colorAbierto.color);
  const imagenItem = items.find(
    (item) => item.id === imagenAbierta?.id && (item.imagenManual ?? null) === imagenAbierta.imagen,
  );
  const selectClass =
    "h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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
          {paymentMethod ? (
            <DropdownMenuItem onSelect={() => setPaymentOpen(true)}>
              <Wallet className="mr-2 h-4 w-4" />
              Cambiar forma de pago
            </DropdownMenuItem>
          ) : null}
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
          {canReactivate ? (
            <DropdownMenuItem onSelect={() => setReactivateOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reactivar
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {paymentMethod ? (
        <ChangePaymentMethodDialog {...paymentMethod} open={paymentOpen} onOpenChange={setPaymentOpen} />
      ) : null}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
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
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
                  className="h-8 text-sm"
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

      <Dialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reactivar orden</DialogTitle>
          </DialogHeader>
          <form action={adminReactivateOrderAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="orderId" value={orderId} />
            <div className="space-y-1.5">
              <label htmlFor="order-reactivate-reason" className="text-sm font-medium text-foreground">
                Motivo
              </label>
              <Input
                id="order-reactivate-reason"
                name="reactivateReason"
                value={reactivateReason}
                onChange={(event) => setReactivateReason(event.target.value)}
                required
                minLength={REACTIVATE_MIN}
                maxLength={REACTIVATE_MAX}
                placeholder={`Mínimo ${REACTIVATE_MIN} letras`}
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                La orden vuelve al estado que tenía antes de cancelarse. Si al cancelar se devolvieron piezas al
                inventario, se vuelven a sacar. La venta y los cobros no cambian.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReactivateOpen(false)}>
                Volver
              </Button>
              <Button type="submit" disabled={reactivateReason.trim().length < REACTIVATE_MIN}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reactivar orden
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(open) => (open ? null : setEditOpen(false))}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-x-hidden overflow-y-auto">
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
                También actualiza la fecha de los cobros de la venta para que concuerden.
              </p>
              <MotivoRetroactivoField fecha={date} fechaOriginal={orderDate} className="mt-2" />
            </div>

            {items.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="order-edit-all" className="text-sm font-medium text-foreground">
                  Cambiar todos a:
                </label>
                <select
                  id="order-edit-all"
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    const mode = event.target.value === "MANUFACTURE" ? "MANUFACTURE" : "STOCK";
                    setModes(Object.fromEntries(items.map((item) => [item.id, mode])));
                  }}
                  className={`${selectClass} w-full sm:w-auto`}
                >
                  <option value="">Elegir estado</option>
                  <option value="STOCK">Stock</option>
                  <option value="MANUFACTURE">Fabricación</option>
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="break-words text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.code ? `${item.code} · ` : ""}x{item.quantity}
                    </p>
                    {item.color || item.canChangeColor ? (
                      <p className="break-words text-xs text-muted-foreground">
                        Color: {item.color || "sin color"}
                        {item.canChangeColor ? (
                          <button
                            type="button"
                            onClick={() => setColorAbierto({ id: item.id, color: item.color ?? "" })}
                            className="ml-2 underline hover:text-foreground"
                          >
                            Cambiar color
                          </button>
                        ) : null}
                      </p>
                    ) : null}
                    {item.canChangeColor ? (
                      <p className="text-xs text-muted-foreground">
                        Imagen: {item.imagenManual ? "subida a mano" : "del catálogo"}
                        <button
                          type="button"
                          onClick={() => setImagenAbierta({ id: item.id, imagen: item.imagenManual ?? null })}
                          className="ml-2 underline hover:text-foreground"
                        >
                          Cambiar imagen
                        </button>
                      </p>
                    ) : null}
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
                    aria-label={`Estado de ${item.name}`}
                    className={`${selectClass} w-full shrink-0 sm:w-auto`}
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
          {/* Fuera del <form> de arriba: cada uno guarda con su propio formulario. */}
          {colorItem?.canChangeColor ? (
            <ChangeItemColorDialog
              key={colorItem.id}
              open
              onOpenChange={(open) => (open ? null : setColorAbierto(null))}
              orderItemId={colorItem.id}
              productName={colorItem.name}
              currentColor={colorItem.color ?? ""}
              partes={colorItem.partesDef}
              partesElegidas={colorItem.partesElegidas}
            />
          ) : null}
          {imagenItem?.canChangeColor ? (
            <ChangeItemImageDialog
              key={imagenItem.id}
              open
              onOpenChange={(open) => (open ? null : setImagenAbierta(null))}
              orderItemId={imagenItem.id}
              productName={imagenItem.name}
              imagenActual={imagenItem.imagenManual ?? imagenItem.imagenCatalogo ?? null}
              imagenManual={imagenItem.imagenManual ?? null}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
