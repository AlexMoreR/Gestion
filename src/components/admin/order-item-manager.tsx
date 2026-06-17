"use client";

import { useState } from "react";
import { Factory, PackageCheck, X } from "lucide-react";
import {
  adminConfirmOrderItemAction,
  adminDeleteOrderItemPhotoAction,
  adminDispatchItemAction,
} from "@/app/actions/order-item-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

type SupplierOption = {
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
  quantity: number;
  unitPrice: number;
  fulfillmentLabel: string;
  observations: string;
  isConfirmed: boolean;
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
};

type OrderItemManagerProps = {
  item: OrderItemManagerData;
  currency: SupportedCurrencyCode;
  returnTo: string;
};

export function OrderItemManager({ item, currency, returnTo }: OrderItemManagerProps) {
  const [open, setOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"PAY_NOW" | "PAY_LATER">(
    item.paymentStatus === "PAID" ? "PAY_NOW" : "PAY_LATER",
  );
  const hasSuppliers = item.suppliers.length > 0;

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{item.productName}</p>
            <Badge
              variant="outline"
              className={
                item.isConfirmed
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {item.isConfirmed ? "Fabricando" : "Sin confirmar"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {item.quantity} x {formatMoney(item.unitPrice, currency)} - {item.fulfillmentLabel}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className={
            item.isConfirmed
              ? "h-8 shrink-0 bg-blue-600 text-white hover:bg-blue-700"
              : "h-8 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
          }
          onClick={() => setOpen(true)}
        >
          {item.isConfirmed ? <PackageCheck className="h-4 w-4" /> : <Factory className="h-4 w-4" />}
          {item.isConfirmed ? "Recoger" : "Fabricar"}
        </Button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${item.isConfirmed ? "Recoger" : "Fabricar"} ${item.productName}`}
          onClick={() => setOpen(false)}
        >
          <Card
            className="flex max-h-[88vh] w-full max-w-lg flex-col gap-0 overflow-y-auto rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{item.productName}</h2>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} x {formatMoney(item.unitPrice, currency)} - {item.fulfillmentLabel}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Confirmacion de compra (solo antes de confirmar) */}
            {!item.isConfirmed ? (
            <div className="space-y-2 rounded-md border border-dashed border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
                    <Input
                      name="purchaseCost"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={item.defaultCost}
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
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <form action={adminDispatchItemAction} className="space-y-4">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="orderItemId" value={item.id} />

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
                      <Input type="file" name="receipt" accept="image/*,application/pdf" className="h-8 text-xs" />
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Foto del producto terminado
                    </p>
                    {item.photos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aun sin fotos.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {item.photos.map((photo) => (
                          <span key={photo.id} className="relative inline-block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.url}
                              alt={photo.name ?? "Foto del producto"}
                              className="h-16 w-16 rounded-md border border-border object-cover"
                            />
                          </span>
                        ))}
                      </div>
                    )}
                    <Input
                      type="file"
                      name="photos"
                      accept="image/*"
                      multiple
                      className="h-8 max-w-xs text-xs"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <PackageCheck className="h-4 w-4" />
                    Marcar como recogido
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Sin al menos una foto del producto terminado no se puede recoger.
                  </p>
                </form>

                {item.photos.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Eliminar fotos:</p>
                    <div className="flex flex-wrap gap-2">
                      {item.photos.map((photo) => (
                        <form key={photo.id} action={adminDeleteOrderItemPhotoAction}>
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="photoId" value={photo.id} />
                          <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">
                            Quitar {photo.name ? `(${photo.name})` : "foto"}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
