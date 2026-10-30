"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export type PaymentAccountOption = { id: string; name: string; type?: string };

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// Pago del flete al transportador: de que cuenta salio la plata y la foto o PDF del
// comprobante (obligatoria salvo en efectivo, como en Gastos). Con valor $0 no pide nada.
// El servidor vuelve a revisar lo mismo (legPaymentError).
export function ShippingPaymentFields({
  accounts,
  amount,
  accountName,
  receiptName,
  onAccountChange,
}: {
  accounts: PaymentAccountOption[];
  amount: number;
  /** Nombre del campo de la cuenta; sin nombre, el valor lo guarda el padre (onAccountChange). */
  accountName?: string;
  receiptName: string;
  onAccountChange?: (accountId: string) => void;
}) {
  const [accountId, setAccountId] = useState("");
  if (!(amount > 0)) {
    return null;
  }
  const isCash = accounts.find((account) => account.id === accountId)?.type === "CASH";

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="min-w-0 space-y-1">
        <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pagado desde</label>
        <select
          name={accountName}
          value={accountId}
          onChange={(event) => {
            setAccountId(event.target.value);
            onAccountChange?.(event.target.value);
          }}
          required
          className={SELECT_CLASS}
          aria-label="Cuenta de donde salió el pago del flete"
        >
          <option value="" disabled>
            Elige la cuenta
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {accounts.length === 0 ? (
          <p className="text-xs text-destructive">No hay cuentas activas. Créala en Balances.</p>
        ) : null}
      </div>
      <div className="min-w-0 space-y-1">
        <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Comprobante{isCash ? " (opcional en efectivo)" : ""}
        </label>
        <Input
          type="file"
          name={receiptName}
          accept="image/*,application/pdf"
          required={!isCash}
          className="h-8 text-xs"
          aria-label="Foto o PDF del comprobante del pago del flete"
        />
      </div>
    </div>
  );
}
