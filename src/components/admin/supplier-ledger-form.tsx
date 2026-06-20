"use client";

import { useState } from "react";
import { CalendarDays, ClipboardList, FileText, ImagePlus, Plus, Trash2, Wallet } from "lucide-react";
import {
  adminCreateSupplierPaymentsAction,
  adminDeleteSupplierPaymentAction,
} from "@/app/actions/supplier-ledger-actions";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
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

type PaymentLine = {
  id: string;
  orderId: string;
  amount: string;
};

function todayInputValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function newLine(): PaymentLine {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    orderId: "",
    amount: "",
  };
}

export function SupplierLedgerForm({
  supplierId,
  orders,
  ledger,
  accounts,
  currency,
  returnTo,
}: SupplierLedgerFormProps) {
  const [lines, setLines] = useState<PaymentLine[]>(() => [newLine()]);
  const [ledgerReceiptName, setLedgerReceiptName] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInputValue());

  const selectClass =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  const total = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const canSubmit = Boolean(ledgerReceiptName) && total > 0;

  const updateLine = (id: string, values: Partial<Omit<PaymentLine, "id">>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...values } : line)));
  };
  const addLine = () => setLines((current) => [...current, newLine()]);
  const removeLine = (id: string) =>
    setLines((current) => (current.length > 1 ? current.filter((line) => line.id !== id) : current));

  const pendingByOrder = new Map(orders.map((order) => [order.orderId, order.pending]));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <form
          action={adminCreateSupplierPaymentsAction}
          className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)]"
        >
          <input type="hidden" name="supplierId" value={supplierId} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* Comprobante primero, a la izquierda (igual que el formulario de producto). */}
            <div className="shrink-0 space-y-1.5">
              <label
                className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg bg-zinc-200 text-zinc-500 transition hover:bg-zinc-300 hover:text-zinc-600"
                title="Subir comprobante"
              >
                <ImagePlus className="size-6" />
                <span className="text-xs font-medium">Foto</span>
                <input
                  type="file"
                  name="receipt"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(event) => setLedgerReceiptName(event.target.files?.[0]?.name ?? "")}
                />
              </label>
              {ledgerReceiptName ? (
                <p className="w-32 truncate text-xs text-slate-500">{ledgerReceiptName}</p>
              ) : null}
            </div>

            {/* Fecha y Cuenta en una fila; Nota debajo. */}
            <div className="flex-1 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><CalendarDays className="h-4 w-4 text-slate-500" />Fecha del pago</span>
                  <DatePicker
                    name="paymentDate"
                    value={paymentDate}
                    onChange={setPaymentDate}
                    required
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Wallet className="h-4 w-4 text-slate-500" />Cuenta</span>
                  <select name="accountId" defaultValue="" required className={selectClass}>
                    <option value="" disabled>Cuenta (origen del pago)</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><FileText className="h-4 w-4 text-slate-500" />Nota</span>
                <Input name="note" placeholder="Referencia del pago" />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><ClipboardList className="h-4 w-4 text-slate-500" />Ordenes a pagar</span>
              <Button type="button" size="sm" className="gap-1.5" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" />
                Agregar orden
              </Button>
            </div>

            {lines.map((line) => {
              const pending = line.orderId ? pendingByOrder.get(line.orderId) ?? 0 : 0;
              const usedOrders = new Set(lines.filter((l) => l.id !== line.id).map((l) => l.orderId));
              return (
                <div
                  key={line.id}
                  className="grid gap-2 rounded-lg border border-[var(--line)] bg-slate-50/60 p-2 sm:grid-cols-[1fr_9rem_2rem] sm:items-center"
                >
                  <select
                    value={line.orderId}
                    onChange={(event) => {
                      const orderId = event.target.value;
                      const nextPending = orderId ? pendingByOrder.get(orderId) ?? 0 : 0;
                      updateLine(line.id, {
                        orderId,
                        // Autocompleta el monto con el pendiente al elegir la orden.
                        amount: orderId && nextPending > 0 ? String(Math.round(nextPending)) : line.amount,
                      });
                    }}
                    className={`${selectClass} bg-white`}
                  >
                    <option value="">Abono general (sin orden)</option>
                    {orders.map((order) => (
                      <option key={order.orderId} value={order.orderId} disabled={usedOrders.has(order.orderId)}>
                        {order.code} — pendiente {formatMoney(order.pending, currency)}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      $
                    </span>
                    <Input
                      inputMode="numeric"
                      className="bg-white pl-5 text-right"
                      value={line.amount ? Number(line.amount).toLocaleString("es-CO") : ""}
                      onChange={(event) => updateLine(line.id, { amount: event.target.value.replace(/\D/g, "") })}
                      placeholder={pending > 0 ? Math.round(pending).toLocaleString("es-CO") : "0"}
                    />
                  </div>
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600"
                      onClick={() => removeLine(line.id)}
                      aria-label="Quitar orden"
                      disabled={lines.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <input type="hidden" name="orderIds" value={line.orderId} />
                  <input type="hidden" name="amounts" value={line.amount} />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2.5">
            <span className="text-sm font-medium text-slate-700">Total a pagar</span>
            <span className="text-lg font-bold tracking-tight text-[var(--primary)]">{formatMoney(total, currency)}</span>
          </div>

          <Button type="submit" className="h-11 w-full text-base" disabled={!canSubmit}>
            Registrar pago
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
              className={`flex items-start justify-between gap-3 rounded-lg border border-l-4 border-[var(--line)] bg-white p-3 transition-colors hover:bg-slate-50/60 ${
                entry.type === "CHARGE" ? "border-l-red-400" : "border-l-emerald-400"
              }`}
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
              <div className="flex shrink-0 items-center gap-2">
                <p
                  className={`text-sm font-semibold ${
                    entry.type === "CHARGE" ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {entry.type === "CHARGE" ? "+" : "-"}
                  {formatMoney(entry.amount, currency)}
                </p>
                {entry.type === "PAYMENT" ? (
                  <form
                    action={adminDeleteSupplierPaymentAction}
                    onSubmit={(event) => {
                      if (!window.confirm("¿Eliminar este abono?")) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="paymentId" value={entry.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-600"
                      aria-label="Eliminar abono"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
