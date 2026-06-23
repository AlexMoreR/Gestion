"use client";

import { useState } from "react";
import { BarChart3, CalendarDays, ClipboardList, FileText, ImagePlus, Plus, Trash2, Wallet } from "lucide-react";
import {
  adminCreateSupplierChargeAction,
  adminCreateSupplierPaymentsAction,
} from "@/app/actions/supplier-ledger-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupplierLedgerTable } from "@/components/admin/supplier-ledger-table";
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
  createdByImage: string | null;
  accountName: string | null;
  orderCode: string | null;
  code: string | null;
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

type SupplierChargeOption = {
  chargeId: string;
  code: string;
  pending: number;
};

type SupplierLedgerFormProps = {
  supplierId: string;
  balanceToken: string | null;
  balance: number;
  orders: SupplierOrderOption[];
  charges: SupplierChargeOption[];
  ledger: LedgerEntry[];
  accounts: AccountOption[];
  currency: SupportedCurrencyCode;
  returnTo: string;
};

type PaymentLine = {
  id: string;
  // "" = abono general | "order:<id>" | "charge:<id>"
  target: string;
  amount: string;
};

function todayInputValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function newLine(): PaymentLine {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    target: "",
    amount: "",
  };
}

export function SupplierLedgerForm({
  supplierId,
  balanceToken,
  orders,
  charges,
  ledger,
  accounts,
  currency,
  returnTo,
}: SupplierLedgerFormProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"payment" | "charge">("payment");
  const [lines, setLines] = useState<PaymentLine[]>(() => [newLine()]);
  const [ledgerReceiptName, setLedgerReceiptName] = useState("");
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(todayInputValue());

  // Estado del formulario de cargo manual.
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeNote, setChargeNote] = useState("");
  const [chargeDate, setChargeDate] = useState(todayInputValue());
  const [chargeReceiptName, setChargeReceiptName] = useState("");
  const [chargeReceiptPreview, setChargeReceiptPreview] = useState<string | null>(null);

  const handleChargeReceiptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setChargeReceiptName(file?.name ?? "");
    setChargeReceiptPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
  };

  const canSubmitCharge = (Number(chargeAmount) || 0) > 0;

  const handleReceiptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setLedgerReceiptName(file?.name ?? "");
    setReceiptPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
  };

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

  // Pendiente por "target" (order:<id> / charge:<id>).
  const pendingByTarget = new Map<string, number>([
    ...orders.map((order) => [`order:${order.orderId}`, order.pending] as const),
    ...charges.map((charge) => [`charge:${charge.chargeId}`, charge.pending] as const),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {balanceToken ? (
          <a
            href={`/proveedores/${balanceToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-card px-4 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <BarChart3 className="h-4 w-4" />
            Ver balance
          </a>
        ) : null}
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Registrar movimiento
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Registrar movimiento</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="inline-flex rounded-lg border border-[var(--line)] bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode("payment")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  mode === "payment" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Abono
              </button>
              <button
                type="button"
                onClick={() => setMode("charge")}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  mode === "charge" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Cargo manual
              </button>
            </div>

        {mode === "charge" ? (
          <form
            id="supplier-charge-form"
            action={adminCreateSupplierChargeAction}
            className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)]"
          >
            <input type="hidden" name="supplierId" value={supplierId} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <p className="text-xs text-slate-500">
              Registra una deuda al proveedor por un servicio o trabajo que no proviene de una orden (ej. tapizado, reparación).
            </p>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0 space-y-1.5">
                <label
                  className="relative flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-zinc-200 text-zinc-500 transition hover:bg-zinc-300 hover:text-zinc-600"
                  title="Subir comprobante (opcional)"
                >
                  {chargeReceiptPreview ? (
                    <img
                      src={chargeReceiptPreview}
                      alt="Comprobante"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <>
                      <ImagePlus className="size-6" />
                      <span className="text-xs font-medium">Foto (opcional)</span>
                    </>
                  )}
                  <input
                    type="file"
                    name="receipt"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleChargeReceiptChange}
                  />
                </label>
                {chargeReceiptName ? (
                  <p className="w-32 truncate text-xs text-slate-500">{chargeReceiptName}</p>
                ) : null}
              </div>

              <div className="flex-1 space-y-3">
                <label className="block space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><CalendarDays className="h-4 w-4 text-slate-500" />Fecha del cargo</span>
                  <DatePicker name="paymentDate" value={chargeDate} onChange={setChargeDate} required />
                </label>
                <label className="block space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><Wallet className="h-4 w-4 text-slate-500" />Monto</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <Input
                      inputMode="numeric"
                      className="pl-5 text-right"
                      value={chargeAmount ? Number(chargeAmount).toLocaleString("es-CO") : ""}
                      onChange={(event) => setChargeAmount(event.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                    />
                  </div>
                  <input type="hidden" name="amount" value={chargeAmount} />
                </label>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><FileText className="h-4 w-4 text-slate-500" />Nota</span>
              <Input
                name="note"
                value={chargeNote}
                onChange={(event) => setChargeNote(event.target.value)}
                placeholder="Ej. Tapizado silla garantía"
              />
            </label>

          </form>
        ) : (
        <form
          id="supplier-payment-form"
          action={adminCreateSupplierPaymentsAction}
          className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-4 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)]"
        >
          <input type="hidden" name="supplierId" value={supplierId} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* Comprobante primero, a la izquierda (igual que el formulario de producto). */}
            <div className="shrink-0 space-y-1.5">
              <label
                className="relative flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-zinc-200 text-zinc-500 transition hover:bg-zinc-300 hover:text-zinc-600"
                title="Subir comprobante"
              >
                {receiptPreview ? (
                  <img
                    src={receiptPreview}
                    alt="Comprobante"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <ImagePlus className="size-6" />
                    <span className="text-xs font-medium">Foto</span>
                  </>
                )}
                <input
                  type="file"
                  name="receipt"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleReceiptChange}
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
                    <option value="" disabled>Seleccionar</option>
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
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"><ClipboardList className="h-4 w-4 text-slate-500" />Órdenes y cargos a pagar</span>
              <Button type="button" size="sm" className="gap-1.5" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" />
                Agregar línea
              </Button>
            </div>

            {lines.map((line) => {
              const pending = line.target ? pendingByTarget.get(line.target) ?? 0 : 0;
              const usedTargets = new Set(lines.filter((l) => l.id !== line.id).map((l) => l.target));
              return (
                <div
                  key={line.id}
                  className="grid gap-2 rounded-lg border border-[var(--line)] bg-slate-50/60 p-2 sm:grid-cols-[1fr_9rem_2rem] sm:items-center"
                >
                  <select
                    value={line.target}
                    onChange={(event) => {
                      const target = event.target.value;
                      const nextPending = target ? pendingByTarget.get(target) ?? 0 : 0;
                      updateLine(line.id, {
                        target,
                        // Autocompleta el monto con el pendiente al elegir orden/cargo.
                        amount: target && nextPending > 0 ? String(Math.round(nextPending)) : line.amount,
                      });
                    }}
                    className={`${selectClass} bg-white`}
                  >
                    <option value="">Abono general (sin orden)</option>
                    {orders.length > 0 ? (
                      <optgroup label="Órdenes">
                        {orders.map((order) => (
                          <option
                            key={order.orderId}
                            value={`order:${order.orderId}`}
                            disabled={usedTargets.has(`order:${order.orderId}`)}
                          >
                            {order.code} — pendiente {formatMoney(order.pending, currency)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {charges.length > 0 ? (
                      <optgroup label="Inventario y cargos manuales">
                        {charges.map((charge) => (
                          <option
                            key={charge.chargeId}
                            value={`charge:${charge.chargeId}`}
                            disabled={usedTargets.has(`charge:${charge.chargeId}`)}
                          >
                            {charge.code} — pendiente {formatMoney(charge.pending, currency)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
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
                  <input type="hidden" name="targets" value={line.target} />
                  <input type="hidden" name="amounts" value={line.amount} />
                </div>
              );
            })}
          </div>

        </form>
        )}
          </div>

          {/* Footer fijo: total y boton siempre visibles al fondo del modal. */}
          <div className="shrink-0 space-y-3 border-t border-border bg-card px-6 py-4">
            {mode === "charge" ? (
              <>
                <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <span className="text-sm font-medium text-slate-700">Total a deber</span>
                  <span className="text-lg font-bold tracking-tight text-red-600">
                    {formatMoney(Number(chargeAmount) || 0, currency)}
                  </span>
                </div>
                <Button
                  type="submit"
                  form="supplier-charge-form"
                  className="h-11 w-full text-base"
                  disabled={!canSubmitCharge}
                >
                  Registrar cargo
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2.5">
                  <span className="text-sm font-medium text-slate-700">Total a pagar</span>
                  <span className="text-lg font-bold tracking-tight text-[var(--primary)]">
                    {formatMoney(total, currency)}
                  </span>
                </div>
                <Button
                  type="submit"
                  form="supplier-payment-form"
                  className="h-11 w-full text-base"
                  disabled={!canSubmit}
                >
                  Registrar pago
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SupplierLedgerTable ledger={ledger} currency={currency} returnTo={returnTo} />
    </div>
  );
}
