"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { adminCreateSupplierPaymentAction } from "@/app/actions/supplier-ledger-actions";
import { Input } from "@/components/ui/input";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { Button } from "@/components/ui/button";

type LedgerEntry = {
  id: string;
  type: "CHARGE" | "PAYMENT";
  amount: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  accountName: string | null;
  orderCode: string | null;
  receiptUrl: string | null;
};

type AccountOption = {
  id: string;
  name: string;
};

type SupplierOrderOption = {
  orderId: string;
  code: string;
  pending: number;
};

type SupplierLedgerFormProps = {
  supplierId: string;
  balance: number;
  orders: SupplierOrderOption[];
  ledger: LedgerEntry[];
  accounts: AccountOption[];
  currency: SupportedCurrencyCode;
  returnTo: string;
};

function todayInputValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function SupplierLedgerForm({
  supplierId,
  balance,
  orders,
  ledger,
  accounts,
  currency,
  returnTo,
}: SupplierLedgerFormProps) {
  const [ledgerOrderId, setLedgerOrderId] = useState("");
  const [ledgerAmount, setLedgerAmount] = useState("");
  const [ledgerReceiptName, setLedgerReceiptName] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInputValue());

  const selectClass =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">Saldo</p>
          <p className={`text-2xl font-semibold ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {formatMoney(balance, currency)}
          </p>
        </div>

        <form action={adminCreateSupplierPaymentAction} className="space-y-3">
          <input type="hidden" name="supplierId" value={supplierId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Fecha del abono</span>
              <Input
                name="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                required
              />
            </label>
            {orders.length > 0 ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Orden a pagar (opcional)</span>
                <select
                  name="orderId"
                  value={ledgerOrderId}
                  onChange={(event) => setLedgerOrderId(event.target.value)}
                  className={selectClass}
                >
                  <option value="">Abono general (sin orden)</option>
                  {orders.map((order) => (
                    <option key={order.orderId} value={order.orderId}>
                      {order.code} — pendiente {formatMoney(order.pending, currency)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Monto del abono</span>
              <Input
                inputMode="numeric"
                value={ledgerAmount ? Number(ledgerAmount).toLocaleString("es-CO") : ""}
                onChange={(event) => setLedgerAmount(event.target.value.replace(/\D/g, ""))}
                placeholder="0"
              />
              <input type="hidden" name="amount" value={ledgerAmount} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Cuenta</span>
              <select name="accountId" defaultValue="" className={selectClass}>
                <option value="">Cuenta (origen del pago)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Nota</span>
              <Input name="note" placeholder="Referencia del pago" />
            </label>
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Comprobante</span>
            <div className="flex items-center gap-2">
              <label
                className="flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--line)] text-slate-400 transition hover:border-[var(--line-strong)] hover:text-slate-600"
                title="Subir comprobante"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px] font-medium">Foto</span>
                <input
                  type="file"
                  name="receipt"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(event) => setLedgerReceiptName(event.target.files?.[0]?.name ?? "")}
                />
              </label>
              <span className="min-w-0 truncate text-xs text-slate-500">
                {ledgerReceiptName || "Imagen o PDF · obligatorio"}
              </span>
            </div>
          </div>
          <Button type="submit" className="h-10 w-full" disabled={!ledgerReceiptName || !ledgerAmount}>
            Registrar abono
          </Button>
        </form>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Movimientos</p>
        {ledger.length === 0 ? (
          <p className="text-sm text-slate-500">Sin movimientos registrados.</p>
        ) : (
          ledger.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-[var(--line)] p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {entry.type === "CHARGE" ? "Cargo" : "Abono"}
                  {entry.orderCode ? ` · ${entry.orderCode}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(entry.createdAt).toLocaleDateString("es-CO")}
                  {entry.note ? ` - ${entry.note}` : ""}
                </p>
                <p className="text-xs text-slate-400">
                  {entry.createdByName ?? "Sistema"}
                  {entry.accountName ? ` - ${entry.accountName}` : ""}
                </p>
                {entry.receiptUrl ? (
                  <a
                    href={entry.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver comprobante
                  </a>
                ) : null}
              </div>
              <p
                className={`shrink-0 text-sm font-semibold ${
                  entry.type === "CHARGE" ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {entry.type === "CHARGE" ? "+" : "-"}
                {formatMoney(entry.amount, currency)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
