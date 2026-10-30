"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";
import { adminAddDispatchShippingLegAction } from "@/app/actions/dispatch-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ShippingPaymentFields, type PaymentAccountOption } from "@/components/admin/shipping-payment-fields";
import { CarrierSelect, type CarrierSelectOption } from "@/modules/guias/presentation/carrier-select";

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// Al terminar de guardar cierra el modal y lo vacia: asi un segundo toque no paga el flete dos veces.
function SubmitButton({ onDone }: { onDone: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      onDone();
    }
    wasPending.current = pending;
  }, [pending, onDone]);
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {pending ? "Guardando..." : "Agregar tramo"}
    </Button>
  );
}

// Tramo de envio que se agrega despues de despachar (ej. otro transportador lo entrega). Pide lo
// mismo que al despachar: transportador, valor, cuenta y comprobante (salvo efectivo).
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
  accounts: PaymentAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [formKey, setFormKey] = useState(0);
  const reset = () => {
    setOpen(false);
    setAmount("");
    setFormKey((key) => key + 1);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Agregar tramo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar tramo de envío</DialogTitle>
            <DialogDescription>
              Despacho {dispatchCode}. El valor se suma al flete de la venta y queda pagado desde la cuenta que elijas.
            </DialogDescription>
          </DialogHeader>
          <form key={formKey} action={adminAddDispatchShippingLegAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="dispatchId" value={dispatchId} />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <div className="min-w-0 space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Transportador</label>
                <CarrierSelect carriers={carriers} placeholder="Elige el transportador" className={SELECT_CLASS} />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Valor</label>
                <MoneyInput name="amount" value={amount} onValueChange={setAmount} className="h-8" />
              </div>
            </div>
            <ShippingPaymentFields
              accounts={accounts}
              amount={Number(amount) || 0}
              accountName="accountId"
              receiptName="shippingReceipt"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input name="trackingNumber" placeholder="Guía (opcional)" maxLength={120} className="h-8 text-xs" />
              <Input name="note" placeholder="Nota (ej. Cali a cliente)" maxLength={250} className="h-8 text-xs" />
            </div>
            <SubmitButton onDone={reset} />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
