"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, FileText, ImagePlus, Plus, Trash2, Wallet } from "lucide-react";
import {
  adminCreateSupplierChargeAction,
  adminCreateSupplierPaymentsAction,
} from "@/app/actions/supplier-ledger-actions";
import { SupplierLedgerTable } from "@/components/admin/supplier-ledger-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

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

type TargetOption = {
  target: string;
  kind: "order" | "charge";
  code: string;
  label: string;
  pending: number;
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

function parseAmount(value: string): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
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
  const [accountId, setAccountId] = useState("");

  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeNote, setChargeNote] = useState("");
  const [chargeDate, setChargeDate] = useState(todayInputValue());
  const [chargeReceiptName, setChargeReceiptName] = useState("");
  const [chargeReceiptPreview, setChargeReceiptPreview] = useState<string | null>(null);

  const targetOptions = useMemo<TargetOption[]>(
    () => [
      ...orders.map((order) => ({
        target: `order:${order.orderId}`,
        kind: "order" as const,
        code: order.code,
        label: `Orden ${order.code}`,
        pending: order.pending,
      })),
      ...charges.map((charge) => ({
        target: `charge:${charge.chargeId}`,
        kind: "charge" as const,
        code: charge.code,
        label: `Cargo ${charge.code}`,
        pending: charge.pending,
      })),
    ],
    [charges, orders],
  );

  const targetById = useMemo(
    () => new Map(targetOptions.map((target) => [target.target, target] as const)),
    [targetOptions],
  );

  const lineSummaries = useMemo(
    () =>
      lines.map((line) => {
        const amount = parseAmount(line.amount);
        const target = line.target ? targetById.get(line.target) ?? null : null;
        const remaining = target ? target.pending - amount : null;
        return {
          id: line.id,
          targetValue: line.target,
          amount,
          target,
          remaining,
          exceedsPending: Boolean(target && amount > target.pending + 0.5),
          staleTarget: Boolean(line.target && !target),
        };
      }),
    [lines, targetById],
  );

  const total = lineSummaries.reduce((sum, line) => sum + line.amount, 0);
  const selectedDebt = lineSummaries.reduce((sum, line) => sum + (line.target?.pending ?? 0), 0);
  const selectedRemaining = lineSummaries.reduce(
    (sum, line) => sum + (line.remaining === null ? 0 : Math.max(0, line.remaining)),
    0,
  );
  const hasTargetLines = lineSummaries.some((line) => line.target !== null);
  const hasOverpayment = lineSummaries.some((line) => line.exceedsPending);
  const hasStaleTarget = lineSummaries.some((line) => line.staleTarget);
  const canSubmit = Boolean(ledgerReceiptName) && Boolean(accountId) && total > 0 && !hasOverpayment && !hasStaleTarget;
  const canSubmitCharge = (Number(chargeAmount) || 0) > 0;

  const handleChargeReceiptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setChargeReceiptName(file?.name ?? "");
    setChargeReceiptPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
  };

  const handleReceiptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setLedgerReceiptName(file?.name ?? "");
    setReceiptPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
  };

  const updateLine = (id: string, values: Partial<Omit<PaymentLine, "id">>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...values } : line)));
  };
  const addLine = () => setLines((current) => [...current, newLine()]);
  const removeLine = (id: string) =>
    setLines((current) => (current.length > 1 ? current.filter((line) => line.id !== id) : current));

  return (
    <div className="space-y-5">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle className="inline-flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span>Registrar movimiento</span>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <Tabs value={mode} onValueChange={(value) => setMode(value as "payment" | "charge")}>
              <TabsList>
                <TabsTrigger value="payment">Abono</TabsTrigger>
                <TabsTrigger value="charge">Cargo manual</TabsTrigger>
              </TabsList>
            </Tabs>

            {mode === "charge" ? (
              <form id="supplier-charge-form" action={adminCreateSupplierChargeAction} className="space-y-4 rounded-lg border bg-card p-4">
                <input type="hidden" name="supplierId" value={supplierId} />
                <input type="hidden" name="returnTo" value={returnTo} />

                <p className="text-xs text-muted-foreground">
                  Registra una deuda al proveedor por un servicio o trabajo que no proviene de una orden.
                </p>

                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="shrink-0 space-y-1.5">
                    <label
                      className="relative flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-muted text-muted-foreground transition hover:bg-muted/80 sm:h-24 sm:w-24"
                      title="Subir comprobante (opcional)"
                    >
                      {chargeReceiptPreview ? (
                        <Image
                          src={chargeReceiptPreview}
                          alt="Comprobante"
                          fill
                          sizes="(min-width: 640px) 96px, 80px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <>
                          <ImagePlus className="size-5" />
                          <span className="text-center text-[11px] font-medium leading-tight">Foto opcional</span>
                        </>
                      )}
                      <input type="file" name="receipt" accept="image/*,application/pdf" className="hidden" onChange={handleChargeReceiptChange} />
                    </label>
                    {chargeReceiptName ? <p className="w-20 truncate text-xs text-muted-foreground sm:w-24">{chargeReceiptName}</p> : null}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <label className="block space-y-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        Fecha del cargo
                      </span>
                      <DatePicker name="paymentDate" value={chargeDate} onChange={setChargeDate} required />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        Monto
                      </span>
                      <MoneyInput value={chargeAmount} onValueChange={setChargeAmount} name="amount" className="text-right" />
                    </label>
                  </div>
                </div>

                <label className="block space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Nota
                  </span>
                  <Input name="note" value={chargeNote} onChange={(event) => setChargeNote(event.target.value)} placeholder="Detalle del cargo" />
                </label>
              </form>
            ) : (
              <form id="supplier-payment-form" action={adminCreateSupplierPaymentsAction} className="space-y-4 rounded-lg border bg-card p-4">
                <input type="hidden" name="supplierId" value={supplierId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="accountId" value={accountId} />

                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="shrink-0 space-y-1.5">
                    <label
                      className="relative flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-muted text-muted-foreground transition hover:bg-muted/80 sm:h-24 sm:w-24"
                      title="Subir comprobante"
                    >
                      {receiptPreview ? (
                        <Image
                          src={receiptPreview}
                          alt="Comprobante"
                          fill
                          sizes="(min-width: 640px) 96px, 80px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <>
                          <ImagePlus className="size-5" />
                          <span className="text-[11px] font-medium leading-tight">Foto</span>
                        </>
                      )}
                      <input type="file" name="receipt" accept="image/*,application/pdf" className="hidden" onChange={handleReceiptChange} />
                    </label>
                    {ledgerReceiptName ? <p className="w-20 truncate text-xs text-muted-foreground sm:w-24">{ledgerReceiptName}</p> : null}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          Fecha del pago
                        </span>
                        <DatePicker name="paymentDate" value={paymentDate} onChange={setPaymentDate} required />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <Wallet className="h-4 w-4 text-muted-foreground" />
                          Cuenta
                        </span>
                        <Select value={accountId || null} onValueChange={(value) => setAccountId(value ?? "")}>
                          <SelectTrigger className="w-full bg-background">
                            <SelectValue placeholder="Seleccionar cuenta">
                              {(value) => accounts.find((account) => account.id === value)?.name ?? "Seleccionar cuenta"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent align="start">
                            {accounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {accounts.length === 0 ? <p className="text-xs text-destructive">Crea una cuenta activa antes de registrar abonos.</p> : null}
                      </label>
                    </div>
                    <label className="block space-y-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Nota
                      </span>
                      <Input name="note" placeholder="Referencia del pago" />
                    </label>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      Órdenes y cargos a pagar
                    </span>
                    <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addLine}>
                      <Plus className="h-3.5 w-3.5" />
                      Agregar línea
                    </Button>
                  </div>

                  {lineSummaries.map((line, index) => {
                    const usedTargets = new Set(lines.filter((item) => item.id !== line.id && item.target).map((item) => item.target));
                    const remaining = line.remaining === null ? null : Math.max(0, line.remaining);

                    return (
                      <div key={line.id} className="space-y-3 rounded-lg border bg-background p-3">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_2rem] sm:items-start">
                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Orden o cargo</span>
                            <Select
                              value={line.targetValue || "general"}
                              onValueChange={(value) => {
                                const target = value === "general" || value === null ? "" : String(value);
                                const option = target ? targetById.get(target) : null;
                                updateLine(line.id, {
                                  target,
                                  amount: option ? String(Math.round(option.pending)) : line.amount ? String(line.amount) : "",
                                });
                              }}
                            >
                              <SelectTrigger className="w-full bg-background">
                                <SelectValue>
                                  {(value) => {
                                    if (value === "general") return "Abono general";
                                    return targetById.get(String(value))?.label ?? "Seleccionar";
                                  }}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="start">
                                <SelectItem value="general">Abono general (sin orden)</SelectItem>
                                {orders.length > 0 ? (
                                  <>
                                    <SelectSeparator />
                                    <SelectGroup>
                                      <SelectLabel>Órdenes</SelectLabel>
                                      {orders.map((order) => {
                                        const target = `order:${order.orderId}`;
                                        return (
                                          <SelectItem key={order.orderId} value={target} disabled={usedTargets.has(target)}>
                                            {order.code} - {formatMoney(order.pending, currency)}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectGroup>
                                  </>
                                ) : null}
                                {charges.length > 0 ? (
                                  <>
                                    <SelectSeparator />
                                    <SelectGroup>
                                      <SelectLabel>Cargos</SelectLabel>
                                      {charges.map((charge) => {
                                        const target = `charge:${charge.chargeId}`;
                                        return (
                                          <SelectItem key={charge.chargeId} value={target} disabled={usedTargets.has(target)}>
                                            {charge.code} - {formatMoney(charge.pending, currency)}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectGroup>
                                  </>
                                ) : null}
                              </SelectContent>
                            </Select>
                          </label>

                          <label className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">Abono</span>
                            <MoneyInput
                              value={line.amount ? String(line.amount) : ""}
                              onValueChange={(raw) => updateLine(line.id, { amount: raw })}
                              placeholder={line.target?.pending ? Math.round(line.target.pending).toLocaleString("es-CO") : "0"}
                              className="bg-background text-right"
                            />
                          </label>

                          <div className="flex justify-end pt-5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeLine(line.id)}
                              aria-label="Quitar línea"
                              disabled={lines.length <= 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {line.target ? (
                          <div className="grid gap-2 rounded-lg border bg-muted/30 p-2 text-xs sm:grid-cols-3">
                            <div>
                              <p className="text-muted-foreground">Debe</p>
                              <p className="font-semibold text-foreground">{formatMoney(line.target.pending, currency)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Abona</p>
                              <p className={line.exceedsPending ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
                                {formatMoney(line.amount, currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Queda</p>
                              <p className={line.exceedsPending ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
                                {formatMoney(remaining ?? 0, currency)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/20 p-2 text-xs text-muted-foreground">
                            <span>Abono general sin orden o cargo específico.</span>
                            <Badge variant="outline">Línea {index + 1}</Badge>
                          </div>
                        )}

                        {line.exceedsPending ? <p className="text-xs text-destructive">El abono supera el saldo pendiente de esta línea.</p> : null}
                        {line.staleTarget ? <p className="text-xs text-destructive">Esta orden o cargo ya no está disponible.</p> : null}

                        <input type="hidden" name="targets" value={line.targetValue} />
                        <input type="hidden" name="amounts" value={line.amount} />
                      </div>
                    );
                  })}
                </div>
              </form>
            )}
          </div>

          <div className="shrink-0 space-y-3 border-t bg-card px-6 py-4">
            {mode === "charge" ? (
              <>
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                  <span className="text-sm font-medium text-foreground">Total a deber</span>
                  <span className="text-lg font-bold tracking-tight text-destructive">
                    {formatMoney(Number(chargeAmount) || 0, currency)}
                  </span>
                </div>
                <Button type="submit" form="supplier-charge-form" className="h-11 w-full text-base" disabled={!canSubmitCharge}>
                  Registrar cargo
                </Button>
              </>
            ) : (
              <>
                <div className="grid gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Debe seleccionado</p>
                    <p className="text-sm font-semibold text-foreground">
                      {hasTargetLines ? formatMoney(selectedDebt, currency) : "Sin orden"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total a pagar</p>
                    <p className="text-lg font-bold tracking-tight text-primary">{formatMoney(total, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Queda pendiente</p>
                    <p className={hasOverpayment ? "text-sm font-semibold text-destructive" : "text-sm font-semibold text-foreground"}>
                      {hasTargetLines ? formatMoney(selectedRemaining, currency) : "No aplica"}
                    </p>
                  </div>
                </div>
                {!ledgerReceiptName ? <p className="text-xs text-muted-foreground">Adjunta el comprobante para registrar el abono.</p> : null}
                {!accountId ? <p className="text-xs text-muted-foreground">Selecciona la cuenta desde donde sale el dinero.</p> : null}
                <Button type="submit" form="supplier-payment-form" className="h-11 w-full text-base" disabled={!canSubmit}>
                  Registrar pago
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SupplierLedgerTable
        ledger={ledger}
        currency={currency}
        returnTo={returnTo}
        balanceToken={balanceToken}
        onRegisterMovement={() => setOpen(true)}
      />
    </div>
  );
}
