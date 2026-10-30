"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { MAX_EXTRA_SHIPPING_LEGS } from "@/lib/dispatch-shipping-legs";
import type { CarrierSelectOption } from "@/modules/guias/presentation/carrier-select";
import { ShippingPaymentFields, type PaymentAccountOption } from "@/components/admin/shipping-payment-fields";

type LegRow = {
  key: number;
  carrierSupplierId: string;
  amount: string;
  trackingNumber: string;
  note: string;
  accountId: string;
};

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// Otros proveedores de envio del mismo despacho (tramos adicionales). Ej.: el pedido llega a
// Cali con un transportador y desde Cali se despacha con otro. Cada fila es proveedor + valor
// + su pago (cuenta y comprobante) (+ guia/nota opcional). Muestra en vivo el total del envio =
// principal + tramos, y manda las filas al servidor en el input oculto "extraShippingLegs"; el
// comprobante de cada fila va en su propio campo de archivo "legReceipt-<n>".
export function ExtraShippingLegsFields({
  carriers,
  accounts,
  currency,
  mainAmount,
}: {
  carriers: CarrierSelectOption[];
  accounts: PaymentAccountOption[];
  currency: SupportedCurrencyCode;
  /** Valor del tramo principal (la transportadora de arriba). */
  mainAmount: number;
}) {
  const [rows, setRows] = useState<LegRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const addRow = () => {
    if (rows.length >= MAX_EXTRA_SHIPPING_LEGS) {
      return;
    }
    setRows((current) => [...current, { key: nextKey, carrierSupplierId: "", amount: "", trackingNumber: "", note: "", accountId: "" }]);
    setNextKey((key) => key + 1);
  };

  const updateRow = (key: number, patch: Partial<LegRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const removeRow = (key: number) => setRows((current) => current.filter((row) => row.key !== key));

  const extraTotal = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const total = (Number.isFinite(mainAmount) ? mainAmount : 0) + extraTotal;
  const payload = JSON.stringify(
    rows.map((row) => ({
      carrierSupplierId: row.carrierSupplierId,
      amount: Number(row.amount) || 0,
      trackingNumber: row.trackingNumber,
      note: row.note,
      accountId: row.accountId,
      receiptField: `legReceipt-${row.key}`,
    })),
  );

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Otros proveedores de envio</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          onClick={addRow}
          disabled={rows.length >= MAX_EXTRA_SHIPPING_LEGS}
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Si el pedido tuvo otro envio (ej. la llegada a Cali), agregalo aqui y se suma al total.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.key} className="space-y-1.5 rounded-md border border-border/70 bg-muted/30 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">Tramo {index + 2}</span>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                  aria-label={`Quitar tramo ${index + 2}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Quitar
                </button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <select
                  value={row.carrierSupplierId}
                  onChange={(event) => updateRow(row.key, { carrierSupplierId: event.target.value })}
                  required
                  className={SELECT_CLASS}
                  aria-label="Proveedor del tramo"
                >
                  <option value="" disabled>
                    Proveedor
                  </option>
                  {carriers.map((carrier) => (
                    <option key={carrier.id} value={carrier.id}>
                      {carrier.name}
                    </option>
                  ))}
                </select>
                <MoneyInput
                  value={row.amount}
                  onValueChange={(raw) => updateRow(row.key, { amount: raw })}
                  className="h-8"
                />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Input
                  value={row.trackingNumber}
                  onChange={(event) => updateRow(row.key, { trackingNumber: event.target.value })}
                  placeholder="Guia (opcional)"
                  maxLength={120}
                  className="h-8 text-xs"
                />
                <Input
                  value={row.note}
                  onChange={(event) => updateRow(row.key, { note: event.target.value })}
                  placeholder="Nota (ej. Bogota a Cali)"
                  maxLength={250}
                  className="h-8 text-xs"
                />
              </div>
              <ShippingPaymentFields
                accounts={accounts}
                amount={Number(row.amount) || 0}
                receiptName={`legReceipt-${row.key}`}
                onAccountChange={(accountId) => updateRow(row.key, { accountId })}
              />
            </div>
          ))}
        </div>
      )}

      <input type="hidden" name="extraShippingLegs" value={payload} />

      <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-sm">
        <span className="font-medium text-foreground">Total del envio</span>
        <span className="font-semibold text-foreground">{formatMoney(total, currency)}</span>
      </div>
    </div>
  );
}
