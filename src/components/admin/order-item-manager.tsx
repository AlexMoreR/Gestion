"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Factory, ImagePlus, Loader2, MapPin, PackageCheck, Pencil, Truck, X } from "lucide-react";
import {
  adminConfirmOrderItemAction,
  adminDeleteOrderItemPhotoAction,
  adminDispatchItemAction,
} from "@/app/actions/order-item-actions";
import { adminDispatchOrderItemAction } from "@/app/actions/dispatch-actions";
import { Badge } from "@/components/ui/badge";
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
import { TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

type SupplierOption = {
  id: string;
  name: string;
};

type CarrierOption = {
  id: string;
  name: string;
};

type AccountOption = {
  id: string;
  name: string;
};

type ItemPhoto = {
  id: string;
  url: string;
  name: string | null;
};

export type OrderItemManagerData = {
  id: string;
  orderId: string;
  productName: string;
  productCode: string | null;
  quantity: number;
  unitPrice: number;
  fulfillmentLabel: string;
  observations: string;
  isConfirmed: boolean;
  isRecogido: boolean;
  isDespachado: boolean;
  requiresManufacturing: boolean;
  hasProductionJob: boolean;
  suppliers: SupplierOption[];
  defaultSupplierId: string;
  defaultCost: number;
  confirmedSupplierName: string | null;
  purchaseCost: number | null;
  supplierCostTotal: number;
  paymentStatus: "PENDING" | "PAID" | null;
  receiptUrl: string | null;
  photos: ItemPhoto[];
  dispatchCode: string | null;
  dispatchCarrierName: string | null;
};

type OrderItemManagerProps = {
  item: OrderItemManagerData;
  currency: SupportedCurrencyCode;
  returnTo: string;
  accounts: AccountOption[];
  carriers: CarrierOption[];
  defaultAddress: string;
  selected: boolean;
  onToggleSelected: () => void;
};

function DispatchSubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <PackageCheck className="h-4 w-4" />
      )}
      {pending
        ? "Subiendo y guardando..."
        : editing
          ? "Guardar cambios"
          : "Marcar como recogido"}
    </Button>
  );
}

function DispatchItemSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
      {pending ? "Despachando..." : "Despachar producto"}
    </Button>
  );
}

export function OrderItemManager({
  item,
  currency,
  returnTo,
  accounts,
  carriers,
  defaultAddress,
  selected,
  onToggleSelected,
}: OrderItemManagerProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchDeliveryType, setDispatchDeliveryType] = useState<"COUNTER" | "PICKUP" | "SHIPPING">("SHIPPING");
  const [dispatchShippingCost, setDispatchShippingCost] = useState("");
  const isDispatchShipping = dispatchDeliveryType === "SHIPPING";
  // Vista previa de las fotos recien seleccionadas (aun no enviadas al servidor),
  // para que el usuario confirme que la foto quedo adjunta antes de guardar.
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState<"PAY_NOW" | "PAY_LATER">(
    item.paymentStatus === "PAID" ? "PAY_NOW" : "PAY_LATER",
  );
  const [purchaseCost, setPurchaseCost] = useState(
    item.defaultCost ? String(Math.trunc(item.defaultCost)) : "",
  );
  const hasSuppliers = item.suppliers.length > 0;
  // Cuando el item ya esta recogido se muestra un resumen de solo lectura;
  // el lapiz habilita el formulario para editar el despacho.
  const showDispatchForm = !item.isRecogido || editing;

  const openModal = () => {
    setEditing(false);
    setOpen(true);
  };

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="w-8">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          disabled={item.isDespachado}
          className="h-4 w-4 rounded border-input accent-[var(--primary)] disabled:opacity-40"
          aria-label={`Seleccionar ${item.productName}`}
        />
      </TableCell>
      <TableCell>
        <p className="text-sm font-medium text-foreground">{item.productName}</p>
        <p className="text-xs text-muted-foreground">
          {item.productCode ? `${item.productCode} · ` : ""}x{item.quantity}
        </p>
        <Badge
          variant="outline"
          className={`mt-1 text-[10px] ${
            item.requiresManufacturing
              ? "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400"
          }`}
        >
          {item.fulfillmentLabel}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatMoney(item.unitPrice, currency)}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            item.isDespachado
              ? "border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400"
              : item.isRecogido
                ? "border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400"
                : item.isConfirmed
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "border-border bg-muted text-muted-foreground"
          }
        >
          {item.isDespachado
            ? "Despachado"
            : item.isRecogido
              ? "Recogido"
              : item.isConfirmed
                ? "Fabricando"
                : "Sin confirmar"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {item.isDespachado ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled
            title={
              item.dispatchCode
                ? `Despacho ${item.dispatchCode}${item.dispatchCarrierName ? ` - ${item.dispatchCarrierName}` : ""}`
                : "Despachado"
            }
          >
            <Truck className="h-4 w-4" />
            Despachado
          </Button>
        ) : item.isRecogido ? (
          <Button
            type="button"
            size="sm"
            className="h-8 bg-violet-600 text-white hover:bg-violet-700"
            onClick={() => setDispatchOpen(true)}
          >
            <Truck className="h-4 w-4" />
            Despachar
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className={
              item.isConfirmed
                ? "h-8 bg-blue-600 text-white hover:bg-blue-700"
                : "h-8 bg-emerald-600 text-white hover:bg-emerald-700"
            }
            onClick={openModal}
          >
            {item.isConfirmed ? <PackageCheck className="h-4 w-4" /> : <Factory className="h-4 w-4" />}
            {item.isConfirmed ? "Recoger" : "Fabricar"}
          </Button>
        )}

      <Dialog open={open} onOpenChange={(value) => (value ? null : setOpen(false))}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{item.productName}</DialogTitle>
            <DialogDescription>
              {item.quantity} x {formatMoney(item.unitPrice, currency)} - {item.fulfillmentLabel}
            </DialogDescription>
          </DialogHeader>

            {/* Confirmacion de compra (solo antes de confirmar) */}
            {!item.isConfirmed ? (
            <div className="space-y-2 rounded-md border border-dashed border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-foreground">
                  Confirmacion de compra
                </p>
                <p className="text-xs text-muted-foreground">
                  Precio de venta: {formatMoney(item.unitPrice, currency)}
                </p>
              </div>
              {hasSuppliers ? (
                <form
                  action={adminConfirmOrderItemAction}
                  className="grid items-end gap-2 sm:grid-cols-[1fr_auto_auto]"
                >
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="orderItemId" value={item.id} />
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Proveedor</span>
                    <select
                      name="supplierId"
                      defaultValue={item.defaultSupplierId}
                      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      {item.suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Costo de compra</span>
                    <MoneyInput
                      name="purchaseCost"
                      value={purchaseCost}
                      onValueChange={setPurchaseCost}
                      className="sm:w-32"
                    />
                  </label>
                  <Button type="submit" size="sm" variant="outline" className="h-8">
                    {item.isConfirmed ? "Actualizar" : "Confirmar"}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-destructive">
                  El producto no tiene proveedores. Agregalos en el catalogo para confirmar.
                </p>
              )}
            </div>
            ) : null}

            {/* Despacho: pago al proveedor + foto */}
            {item.isConfirmed ? (
              <div className="mt-2 space-y-4">
                {/* Resumen de solo lectura cuando ya esta recogido */}
                {item.isRecogido && !editing ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.2em] font-semibold text-foreground">
                          Pago al proveedor
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            Costo: {formatMoney(item.supplierCostTotal, currency)}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditing(true)}
                            aria-label="Editar despacho"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {item.confirmedSupplierName ? (
                        <p className="text-xs text-muted-foreground">
                          Proveedor: {item.confirmedSupplierName}
                        </p>
                      ) : null}
                      {item.paymentStatus === "PAID" ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-emerald-600">Pagado al proveedor.</p>
                          {item.receiptUrl ? (
                            <a href={item.receiptUrl} target="_blank" rel="noreferrer" className="inline-block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.receiptUrl}
                                alt="Comprobante del proveedor"
                                className="h-28 w-28 rounded-md border border-border object-cover"
                              />
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          Pago pendiente
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.2em] font-semibold text-foreground">
                        Foto del producto terminado
                      </p>
                      {item.photos.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Aun sin fotos.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {item.photos.map((photo) => (
                            <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="inline-block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo.url}
                                alt={photo.name ?? "Foto del producto"}
                                className="h-16 w-16 rounded-md border border-border object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {showDispatchForm ? (
                <form action={adminDispatchItemAction} className="space-y-4">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="orderItemId" value={item.id} />

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.2em] font-semibold text-foreground">
                        Pago al proveedor
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Costo: {formatMoney(item.supplierCostTotal, currency)}
                      </p>
                    </div>
                    {item.confirmedSupplierName ? (
                      <p className="text-xs text-muted-foreground">
                        Proveedor: {item.confirmedSupplierName}
                      </p>
                    ) : null}
                    {item.paymentStatus === "PAID" ? (
                      <p className="text-xs font-medium text-emerald-600">
                        Pagado al proveedor.
                        {item.receiptUrl ? (
                          <>
                            {" "}
                            <a
                              href={item.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Ver recibo
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {item.paymentStatus === "PENDING"
                          ? "Saldo pendiente con el proveedor."
                          : "Aun sin registrar el pago."}
                      </p>
                    )}
                    <div className="flex flex-col gap-1 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="paymentMode"
                          value="PAY_LATER"
                          checked={paymentMode === "PAY_LATER"}
                          onChange={() => setPaymentMode("PAY_LATER")}
                        />
                        <span>Pagar luego (genera saldo pendiente)</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="paymentMode"
                          value="PAY_NOW"
                          checked={paymentMode === "PAY_NOW"}
                          onChange={() => setPaymentMode("PAY_NOW")}
                        />
                        <span>Subir recibo de pago</span>
                      </label>
                    </div>
                    {paymentMode === "PAY_NOW" ? (
                      <div className="space-y-2">
                        <Input type="file" name="receipt" accept="image/*,application/pdf" className="h-8 text-xs" />
                        <label className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">Cuenta de salida</span>
                          <select
                            name="accountId"
                            defaultValue=""
                            required
                            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <option value="">Seleccionar cuenta</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] font-semibold text-foreground">
                      Foto del producto terminado
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.photos.map((photo) => (
                        <span key={photo.id} className="relative inline-block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={photo.name ?? "Foto del producto"}
                            className="h-16 w-16 rounded-md border border-border object-cover"
                          />
                          <button
                            type="submit"
                            form={`del-photo-${photo.id}`}
                            className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-red-600 text-white shadow-sm transition hover:bg-red-700"
                            aria-label={`Quitar foto ${photo.name ?? ""}`}
                            title="Quitar foto"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {/* Miniaturas de las fotos recien seleccionadas (pendientes de guardar) */}
                      {selectedPhotos.map((preview, index) => (
                        <span
                          key={preview}
                          className="relative inline-block"
                          title="Pendiente de guardar"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={preview}
                            alt={`Foto seleccionada ${index + 1}`}
                            className="h-16 w-16 rounded-md border-2 border-blue-500 object-cover"
                          />
                          <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white bg-blue-600 text-[9px] font-bold text-white shadow-sm">
                            +
                          </span>
                        </span>
                      ))}
                      <label
                        className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition hover:border-ring hover:text-foreground"
                        title="Agregar fotos"
                      >
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-[10px] font-medium">Fotos</span>
                        <input
                          type="file"
                          name="photos"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            setSelectedPhotos(files.map((file) => URL.createObjectURL(file)));
                          }}
                        />
                      </label>
                    </div>
                    {selectedPhotos.length > 0 ? (
                      <p className="text-xs font-medium text-blue-600">
                        {selectedPhotos.length}{" "}
                        {selectedPhotos.length === 1 ? "foto lista" : "fotos listas"} para subir.
                        Guarda para confirmar.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    {editing ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setEditing(false)}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                    <DispatchSubmitButton editing={editing} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sin al menos una foto del producto terminado no se puede recoger.
                  </p>
                </form>
                ) : null}

                {/* Formularios para quitar fotos (los activa la "x" sobre cada miniatura) */}
                {showDispatchForm
                  ? item.photos.map((photo) => (
                      <form key={photo.id} id={`del-photo-${photo.id}`} action={adminDeleteOrderItemPhotoAction} className="hidden">
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <input type="hidden" name="photoId" value={photo.id} />
                      </form>
                    ))
                  : null}
              </div>
            ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchOpen} onOpenChange={(value) => (value ? null : setDispatchOpen(false))}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{item.productName}</DialogTitle>
            <DialogDescription>
              {item.productCode ? `${item.productCode} · ` : ""}x{item.quantity}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium text-foreground">Entrega:</span> {defaultAddress || "Sin direccion"}
            </span>
          </div>

            <form action={adminDispatchOrderItemAction} className="space-y-3">
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="orderId" value={item.orderId} />
              <input type="hidden" name="orderItemId" value={item.id} />

              <div className={isDispatchShipping ? "grid gap-3 sm:grid-cols-2" : ""}>
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
                  {!isDispatchShipping ? (
                    <p className="text-xs text-muted-foreground">
                      Sin transportadora ni costo de envío.
                    </p>
                  ) : null}
                </div>

                {isDispatchShipping ? (
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
                        Seleccionar
                      </option>
                      {carriers.map((carrier) => (
                        <option key={carrier.id} value={carrier.id}>
                          {carrier.name}
                        </option>
                      ))}
                    </select>
                    {carriers.length === 0 ? (
                      <p className="text-xs text-destructive">
                        No hay proveedores registrados. Crea la transportadora en Proveedores.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {isDispatchShipping ? (
                <>

                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Costo de envio (gasto de la venta)
                    </label>
                    <MoneyInput
                      name="shippingCost"
                      value={dispatchShippingCost}
                      onValueChange={setDispatchShippingCost}
                    />
                  </div>

                  <input type="hidden" name="shippingMode" value="PAY_LATER" />
                  <p className="text-xs text-muted-foreground">
                    El costo del envío queda como saldo pendiente con la transportadora.
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Foto de la guia
                    </label>
                    <Input
                      type="file"
                      name="trackingPhoto"
                      accept="image/*,application/pdf"
                      className="h-8 text-xs"
                    />
                  </div>

                  <input type="hidden" name="shippingAddress" value={defaultAddress} />
                </>
              ) : null}
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Notas</label>
                <Textarea name="notes" placeholder="Observaciones internas" />
              </div>

              <DispatchItemSubmitButton />
            </form>
        </DialogContent>
      </Dialog>
      </TableCell>
    </TableRow>
  );
}
