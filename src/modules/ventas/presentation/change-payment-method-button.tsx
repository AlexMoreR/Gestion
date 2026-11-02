"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { adminUpdateSalePaymentMethodAction } from "@/app/actions/sales-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SalePaymentMethod } from "../domain/payment-method";
import { PaymentMethodField } from "./payment-method-field";

// Boton "Cambiar forma de pago" del detalle de la orden. Usa la misma accion de la lista de ventas;
// no ofrece "Sin definir".
export function ChangePaymentMethodButton({
  saleId,
  saleCode,
  returnTo,
  defaultValue,
  hasCamillaCombo,
}: {
  saleId: string;
  saleCode: string;
  returnTo: string;
  defaultValue: SalePaymentMethod | null;
  hasCamillaCombo: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<SalePaymentMethod | null>(defaultValue);

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Wallet className="h-3.5 w-3.5" />
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
              id={`order-payment-method-${saleId}`}
              defaultValue={defaultValue}
              hasCamillaCombo={hasCamillaCombo}
              required
              onValueChange={setValue}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!value}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
