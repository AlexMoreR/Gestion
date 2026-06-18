"use client";

import { useState } from "react";
import { Truck, X } from "lucide-react";
import { adminCreateDispatchAction } from "@/app/actions/dispatch-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CarrierOption = {
  id: string;
  name: string;
};

type AccountOption = {
  id: string;
  name: string;
};

type ActiveDispatch = {
  code: string;
  carrierName: string | null;
  trackingNumber: string | null;
};

type OrderDispatchManagerProps = {
  orderId: string;
  returnTo: string;
  carriers: CarrierOption[];
  accounts: AccountOption[];
  defaultAddress: string;
  canDispatch: boolean;
  allItemsConfirmed: boolean;
  allItemsPaymentSet: boolean;
  allItemsHavePhotos: boolean;
  activeDispatch: ActiveDispatch | null;
  display?: "card" | "button";
  buttonLabel?: string;
  buttonClassName?: string;
};

export function OrderDispatchManager({
  orderId,
  returnTo,
  carriers,
  accounts,
  defaultAddress,
  canDispatch,
  allItemsConfirmed,
  allItemsPaymentSet,
  allItemsHavePhotos,
  activeDispatch,
  display = "card",
  buttonLabel = "Despachar orden",
  buttonClassName,
}: OrderDispatchManagerProps) {
  const [open, setOpen] = useState(false);
  const [shippingMode, setShippingMode] = useState<"PAY_NOW" | "PAY_LATER">("PAY_LATER");

  const modal = open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#11182752] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Despachar orden"
          onClick={() => setOpen(false)}
        >
          <Card
            className="flex max-h-[88vh] w-full max-w-lg flex-col gap-0 overflow-y-auto rounded-xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Despachar orden</h2>
                <p className="text-xs text-muted-foreground">
                  Selecciona la transportadora y registra el costo del envio.
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

            <form action={adminCreateDispatchAction} className="space-y-3">
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="orderId" value={orderId} />

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
                {carriers.length === 0 ? (
                  <p className="text-xs text-destructive">
                    No hay proveedores registrados. Crea la transportadora en Proveedores.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Costo de envio (gasto de la venta)
                </label>
                <Input name="shippingCost" type="number" step="0.01" min="0" defaultValue={0} />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Pago del envio
                </label>
                <div className="flex flex-col gap-1 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="shippingMode"
                      value="PAY_LATER"
                      checked={shippingMode === "PAY_LATER"}
                      onChange={() => setShippingMode("PAY_LATER")}
                    />
                    <span>Pagar luego (genera saldo a la transportadora)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="shippingMode"
                      value="PAY_NOW"
                      checked={shippingMode === "PAY_NOW"}
                      onChange={() => setShippingMode("PAY_NOW")}
                    />
                    <span>Subir comprobante de pago</span>
                  </label>
                </div>
                {shippingMode === "PAY_NOW" ? (
                  <div className="space-y-2">
                    <Input
                      type="file"
                      name="shippingReceipt"
                      accept="image/*,application/pdf"
                      className="h-8 text-xs"
                    />
                    <select
                      name="accountId"
                      defaultValue=""
                      className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">Cuenta (origen del gasto) - opcional</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Guia</label>
                <Input name="trackingNumber" placeholder="Numero de guia" />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Direccion</label>
                <Input name="shippingAddress" defaultValue={defaultAddress} />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Notas</label>
                <Textarea name="notes" placeholder="Observaciones internas" />
              </div>

              <Button type="submit" className="w-full">
                <Truck className="h-4 w-4" />
                Crear despacho
              </Button>
            </form>
          </Card>
        </div>
      ) : null;

  if (display === "button") {
    return (
      <>
        <Button
          type="button"
          className={buttonClassName}
          disabled={!canDispatch || Boolean(activeDispatch)}
          onClick={() => setOpen(true)}
        >
          <Truck className="h-4 w-4" />
          {buttonLabel}
        </Button>
        {modal}
      </>
    );
  }

  return (
    <Card className="border-border bg-card/95">
      <CardHeader>
        <CardTitle>Despacho</CardTitle>
        <CardDescription>
          Crea la salida de la orden: transportadora, costo de envio y comprobante.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeDispatch ? (
          <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
            Ya existe un despacho activo:{" "}
            <span className="font-medium text-foreground">{activeDispatch.code}</span>
            {activeDispatch.carrierName ? ` - ${activeDispatch.carrierName}` : ""}
            {activeDispatch.trackingNumber ? ` - Guia ${activeDispatch.trackingNumber}` : ""}
          </div>
        ) : (
          <>
            {!canDispatch ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                Antes de despachar, en cada item (boton Fabricar/Recoger):
                <ul className="ml-4 list-disc">
                  {!allItemsConfirmed ? <li>Confirma el proveedor y costo de todos los items.</li> : null}
                  {!allItemsPaymentSet ? <li>Registra el pago al proveedor (recibo o pagar luego).</li> : null}
                  {!allItemsHavePhotos ? <li>Sube al menos una foto del producto terminado por cada item.</li> : null}
                </ul>
              </div>
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={!canDispatch}
              onClick={() => setOpen(true)}
            >
              <Truck className="h-4 w-4" />
              Despachar orden
            </Button>
          </>
        )}
      </CardContent>
      {modal}
    </Card>
  );
}
