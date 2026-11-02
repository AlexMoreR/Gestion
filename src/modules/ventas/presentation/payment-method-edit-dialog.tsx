"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil } from "lucide-react";
import { adminUpdateSalePaymentMethodAction } from "@/app/actions/sales-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SalePaymentMethod } from "../domain/payment-method";
import { PaymentMethodField } from "./payment-method-field";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Guardar"}
    </Button>
  );
}

// "Cambiar forma de pago" del detalle de la orden: usa la misma accion de la lista de ventas.
export function PaymentMethodEditDialog({
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

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <Pencil className="h-3 w-3" />
        Cambiar forma de pago
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Forma de pago de {saleCode}</DialogTitle>
          </DialogHeader>
          <form action={adminUpdateSalePaymentMethodAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="saleId" value={saleId} />
            <PaymentMethodField
              id="order-edit-payment-method"
              defaultValue={defaultValue}
              hasCamillaCombo={hasCamillaCombo}
              required
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <SaveButton />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
