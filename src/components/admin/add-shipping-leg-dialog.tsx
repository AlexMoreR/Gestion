"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";
import { adminAddDispatchShippingLegAction } from "@/app/actions/dispatch-actions";
import { LegPaymentFields, type LegAccountOption } from "@/components/admin/extra-shipping-legs-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { CarrierSelect, type CarrierSelectOption } from "@/modules/guias/presentation/carrier-select";
import { displayCode } from "@/lib/code-display";

const FIELD_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Guardando..." : "Guardar tramo pagado"}
    </Button>
  );
}

// "Agregar tramo" del recuadro Envio: otro transportador del mismo despacho, pagado de una con
// su cuenta y su comprobante. El valor se suma al flete del despacho.
export function AddShippingLegDialog({
  dispatchId,
  dispatchCode,
  returnTo,
  carriers,
  accounts,
}: {
  dispatchId: string;
  dispatchCode: string;
  returnTo: string;
  carriers: CarrierSelectOption[];
  accounts: LegAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Agregar tramo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar tramo al despacho {displayCode(dispatchCode)}</DialogTitle>
            <DialogDescription>
              Otro transportador del mismo envío. Se le paga de una: el valor se suma al flete de la venta.
            </DialogDescription>
          </DialogHeader>
          <form action={adminAddDispatchShippingLegAction} className="space-y-3">
            <input type="hidden" name="dispatchId" value={dispatchId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Transportador</label>
                <CarrierSelect carriers={carriers} className={FIELD_CLASS} />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Valor</label>
                <MoneyInput name="amount" value={amount} onValueChange={setAmount} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="trackingNumber" placeholder="Guía (opcional)" maxLength={120} className="h-8 text-xs" />
              <Input name="note" placeholder="Nota (ej. Bogotá a Cali)" maxLength={250} className="h-8 text-xs" />
            </div>
            <LegPaymentFields
              accounts={accounts}
              amount={Number(amount) || 0}
              accountFieldName="accountId"
              receiptFieldName="shippingReceipt"
            />
            <SubmitButton />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
