"use client";

import { useState } from "react";
import { adminUpdateSalePaymentMethodAction } from "@/app/actions/sales-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SalePaymentMethod } from "../domain/payment-method";
import { PaymentMethodField } from "./payment-method-field";

// Boton "Cambiar forma de pago" del detalle de la orden (caso SAL-00081). Usa la misma accion
// del menu de ventas; no ofrece "Sin definir".
export function PaymentMethodEditButton({
  saleId,
  saleCode,
  paymentMethod,
  hasCamillaCombo,
  returnTo,
}: {
  saleId: string;
  saleCode: string;
  paymentMethod: SalePaymentMethod | null;
  hasCamillaCombo: boolean;
  returnTo: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        Cambiar forma de pago
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Forma de pago</DialogTitle>
          </DialogHeader>
          <form action={adminUpdateSalePaymentMethodAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="saleId" value={saleId} />
            <p className="text-sm text-muted-foreground">
              Venta <span className="font-medium text-foreground">{saleCode}</span>
            </p>
            <PaymentMethodField
              id="order-edit-payment-method"
              defaultValue={paymentMethod}
              hasCamillaCombo={hasCamillaCombo}
              allowUnset={false}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
