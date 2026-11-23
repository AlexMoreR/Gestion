"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { adminApplySaleDiscountAction } from "@/app/actions/sales-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { displayCode } from "@/lib/code-display";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { MOTIVO_DESCUENTO_MIN } from "../domain/sale-discount";

export type SaleDiscountTarget = {
  id: string;
  code: string;
  clientName: string;
  total: number;
  remainingBalance: number;
};

function GuardarButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Guardando..." : "Aplicar descuento"}
    </Button>
  );
}

// Ventana «Aplicar descuento» del menú de la venta: monto (hasta el saldo pendiente) y motivo.
export function SaleDiscountDialog({
  sale,
  currency,
  returnTo,
  onClose,
}: {
  sale: SaleDiscountTarget | null;
  currency: SupportedCurrencyCode;
  returnTo: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [motivo, setMotivo] = useState("");
  const monto = Number(amount || 0);
  const supera = sale ? monto > sale.remainingBalance : false;

  const cerrar = () => {
    setAmount("");
    setMotivo("");
    onClose();
  };

  return (
    <Dialog open={Boolean(sale)} onOpenChange={(open) => (open ? null : cerrar())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar descuento</DialogTitle>
        </DialogHeader>
        {sale ? (
          <form action={adminApplySaleDiscountAction} className="space-y-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="saleId" value={sale.id} />
            <p className="text-sm text-muted-foreground">
              Venta <span className="font-medium text-foreground">{displayCode(sale.code)}</span> — {sale.clientName}
            </p>
            <p className="text-sm text-muted-foreground">
              Total {formatMoney(sale.total, currency)} · Saldo pendiente {formatMoney(sale.remainingBalance, currency)}
            </p>
            <div className="space-y-1.5">
              <label htmlFor="sale-discount-amount" className="text-sm font-medium text-foreground">
                Monto
              </label>
              <MoneyInput id="sale-discount-amount" name="amount" value={amount} onValueChange={setAmount} />
              {supera ? (
                <p className="text-xs text-destructive">No puede ser mayor que el saldo pendiente.</p>
              ) : monto > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nuevo total {formatMoney(sale.total - monto, currency)} · Saldo{" "}
                  {formatMoney(sale.remainingBalance - monto, currency)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="sale-discount-motivo" className="text-sm font-medium text-foreground">
                Motivo
              </label>
              <Textarea
                id="sale-discount-motivo"
                name="motivo"
                required
                minLength={MOTIVO_DESCUENTO_MIN}
                maxLength={300}
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Ej.: daño en el transporte"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Baja el total y el saldo; la ganancia y la comisión bajan igual. Queda en las notas de la orden.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={cerrar}>
                Cancelar
              </Button>
              <GuardarButton disabled={monto <= 0 || supera || motivo.trim().length < MOTIVO_DESCUENTO_MIN} />
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
