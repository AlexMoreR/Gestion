"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  contraentregaComboWarning,
  PAYMENT_METHOD_LABEL,
  parsePaymentMethodInput,
  SALE_PAYMENT_METHODS,
  type SalePaymentMethod,
} from "../domain/payment-method";

// Selector "Forma de pago" de crear/editar venta. hasCamillaCombo = undefined si no se sabe
// (no se muestra el aviso). El aviso de contraentrega sin combo es suave: no bloquea.
// allowUnset=false quita "Sin definir": la lista arranca en "Escoge la forma de pago" y es obligatoria.
export function PaymentMethodField({
  id = "sale-payment-method",
  defaultValue = null,
  hasCamillaCombo,
  className,
  allowUnset = true,
  onValueChange,
}: {
  id?: string;
  defaultValue?: SalePaymentMethod | null;
  hasCamillaCombo?: boolean;
  className?: string;
  allowUnset?: boolean;
  onValueChange?: (value: SalePaymentMethod | null) => void;
}) {
  const [value, setValue] = useState<SalePaymentMethod | null>(defaultValue);
  const warning =
    hasCamillaCombo === undefined
      ? null
      : contraentregaComboWarning(value, hasCamillaCombo ? [{ categoryName: "combo de camillas" }] : []);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        Forma de pago
      </label>
      <select
        id={id}
        name="paymentMethod"
        value={value ?? ""}
        required={!allowUnset}
        onChange={(event) => {
          const next = parsePaymentMethodInput(event.target.value) ?? null;
          setValue(next);
          onValueChange?.(next);
        }}
        className={
          className ??
          "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        }
      >
        {allowUnset ? (
          <option value="">Sin definir</option>
        ) : (
          <option value="" disabled>
            Escoge la forma de pago
          </option>
        )}
        {SALE_PAYMENT_METHODS.map((method) => (
          <option key={method} value={method}>
            {PAYMENT_METHOD_LABEL[method]}
          </option>
        ))}
      </select>
      {warning ? (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{warning}</span>
        </p>
      ) : null}
    </div>
  );
}
