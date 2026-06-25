"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Factory, Loader2, PackageCheck, Truck, X } from "lucide-react";
import {
  adminBulkConfirmOrderItemsAction,
  adminBulkPickupOrderItemsAction,
} from "@/app/actions/order-item-actions";
import { adminBulkDispatchOrderItemsAction } from "@/app/actions/dispatch-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderItemManager, type OrderItemManagerData } from "@/components/admin/order-item-manager";
import type { SupportedCurrencyCode } from "@/lib/currency";

type CarrierOption = { id: string; name: string };
type AccountOption = { id: string; name: string };

type Stage = "fabricar" | "recoger" | "despachar" | "done";

function stageOf(item: OrderItemManagerData): Stage {
  if (item.isDespachado) return "done";
  if (!item.isConfirmed) return "fabricar";
  if (!item.isRecogido) return "recoger";
  return "despachar";
}

type OrderItemsTableProps = {
  orderId: string;
  items: OrderItemManagerData[];
  currency: SupportedCurrencyCode;
  returnTo: string;
  accounts: AccountOption[];
  carriers: CarrierOption[];
  defaultAddress: string;
};

function BulkSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function OrderItemsTable({
  orderId,
  items,
  currency,
  returnTo,
  accounts,
  carriers,
  defaultAddress,
}: OrderItemsTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | "fabricar" | "recoger" | "despachar">(null);

  // Estado del modal de despacho en lote.
  const [dispatchDeliveryType, setDispatchDeliveryType] = useState<"COUNTER" | "PICKUP" | "SHIPPING">("SHIPPING");
  const [itemCosts, setItemCosts] = useState<Record<string, string>>({});
  const isDispatchShipping = dispatchDeliveryType === "SHIPPING";

  const selectableIds = useMemo(
    () => items.filter((item) => !item.isDespachado).map((item) => item.id),
    [items],
  );

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );

  // Etapa comun de la seleccion: solo se puede actuar en lote si todos los
  // seleccionados estan en la misma etapa.
  const selectedStages = useMemo(
    () => new Set(selectedItems.map((item) => stageOf(item))),
    [selectedItems],
  );
  const commonStage: Stage | null =
    selectedStages.size === 1 ? (selectedStages.values().next().value as Stage) : null;

  const allSelectableChecked = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((current) => {
      if (selectableIds.every((id) => current.has(id)) && selectableIds.length > 0) {
        return new Set();
      }
      return new Set(selectableIds);
    });
  };

  const clearSelection = () => setSelected(new Set());

  const selectedIdsJson = JSON.stringify(selectedItems.map((item) => item.id));
  const count = selectedItems.length;

  const dispatchCostTotal = selectedItems.reduce(
    (sum, item) => sum + (Number(itemCosts[item.id] || 0) || 0),
    0,
  );
  const itemShippingCostsJson = JSON.stringify(
    selectedItems.map((item) => ({ orderItemId: item.id, cost: Number(itemCosts[item.id] || 0) || 0 })),
  );

  const stageLabel: Record<Stage, string> = {
    fabricar: "Fabricar",
    recoger: "Recoger",
    despachar: "Despachar",
    done: "",
  };

  return (
    <>
      {/* Barra de accion en lote (aparece arriba al seleccionar) */}
      {count > 0 ? (
        <div className="sticky top-3 z-30 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm font-medium text-foreground">
            {count} {count === 1 ? "producto seleccionado" : "productos seleccionados"}
          </span>
          <div className="flex items-center gap-2">
            {commonStage && commonStage !== "done" ? (
              <Button
                type="button"
                size="sm"
                className={
                  commonStage === "fabricar"
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : commonStage === "recoger"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-violet-600 text-white hover:bg-violet-700"
                }
                onClick={() => setModal(commonStage)}
              >
                {commonStage === "despachar" ? (
                  <Truck className="h-4 w-4" />
                ) : commonStage === "recoger" ? (
                  <PackageCheck className="h-4 w-4" />
                ) : (
                  <Factory className="h-4 w-4" />
                )}
                {stageLabel[commonStage]} {count}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Selecciona productos en la misma etapa para actuar en lote.
              </span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
              <X className="h-4 w-4" />
              Limpiar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allSelectableChecked}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  className="h-4 w-4 rounded border-input accent-[var(--primary)] disabled:opacity-40"
                  aria-label="Seleccionar todos"
                />
              </TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Accion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <OrderItemManager
                key={item.id}
                item={item}
                currency={currency}
                returnTo={returnTo}
                accounts={accounts}
                carriers={carriers}
                defaultAddress={defaultAddress}
                selected={selected.has(item.id)}
                onToggleSelected={() => toggle(item.id)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Modal: Fabricar en lote */}
      <Dialog open={modal === "fabricar"} onOpenChange={(open) => (open ? null : setModal(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fabricar {count} productos</DialogTitle>
            <DialogDescription>
              Se confirmará cada producto con su proveedor sugerido y su costo por defecto, y pasará a producción.
              Podrás ajustar proveedor o costo luego en cada producto.
            </DialogDescription>
          </DialogHeader>
          <form action={adminBulkConfirmOrderItemsAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="orderItemIds" value={selectedIdsJson} />
            <BulkSubmitButton label="Confirmar y enviar a producción" pendingLabel="Confirmando..." />
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Recoger en lote */}
      <Dialog open={modal === "recoger"} onOpenChange={(open) => (open ? null : setModal(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recoger {count} productos</DialogTitle>
          </DialogHeader>
          <form action={adminBulkPickupOrderItemsAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="orderItemIds" value={selectedIdsJson} />
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Foto del producto terminado (se aplica a todos)
              </label>
              <Input type="file" name="photo" accept="image/*" required className="h-8 text-xs" />
            </div>
            <p className="text-xs text-muted-foreground">
              El pago al proveedor de cada producto queda como saldo pendiente.
            </p>
            <BulkSubmitButton label="Marcar como recogidos" pendingLabel="Guardando..." />
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Despachar en lote */}
      <Dialog open={modal === "despachar"} onOpenChange={(open) => (open ? null : setModal(null))}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Despachar {count} productos</DialogTitle>
          </DialogHeader>

            <form action={adminBulkDispatchOrderItemsAction} className="space-y-3">
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="orderItemIds" value={selectedIdsJson} />

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Modalidad de entrega
                </label>
                <select
                  name="deliveryType"
                  value={dispatchDeliveryType}
                  onChange={(event) =>
                    setDispatchDeliveryType(event.target.value as "COUNTER" | "PICKUP" | "SHIPPING")
                  }
                  className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  <option value="SHIPPING">Transportadora</option>
                  <option value="PICKUP">Recoge en Bodega</option>
                </select>
              </div>

              {isDispatchShipping ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Transportadora
                    </label>
                    <select
                      name="carrierSupplierId"
                      required
                      defaultValue=""
                      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="" disabled>
                        Selecciona la transportadora
                      </option>
                      {carriers.map((carrier) => (
                        <option key={carrier.id} value={carrier.id}>
                          {carrier.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 rounded-lg border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Costo de envio por producto
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Total: {dispatchCostTotal.toLocaleString("es-CO", { style: "currency", currency })}
                      </span>
                    </div>
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {selectedItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.productCode ? `${item.productCode} · ` : ""}x{item.quantity}
                            </p>
                          </div>
                          <MoneyInput
                            value={itemCosts[item.id] ?? ""}
                            onValueChange={(value) =>
                              setItemCosts((current) => ({ ...current, [item.id]: value }))
                            }
                            className="w-32 shrink-0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <input type="hidden" name="shippingMode" value="PAY_LATER" />
                  <input type="hidden" name="itemShippingCosts" value={itemShippingCostsJson} />
                  <input type="hidden" name="shippingCost" value={dispatchCostTotal} />
                  <p className="text-xs text-muted-foreground">
                    El costo del envío queda como saldo pendiente con la transportadora.
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Foto de la guia</label>
                    <Input type="file" name="trackingPhoto" accept="image/*,application/pdf" className="h-8 text-xs" />
                  </div>
                  <input type="hidden" name="shippingAddress" value={defaultAddress} />
                </>
              ) : null}

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Notas</label>
                <Textarea name="notes" placeholder="Observaciones internas" />
              </div>

              <BulkSubmitButton label="Despachar productos" pendingLabel="Despachando..." />
            </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
