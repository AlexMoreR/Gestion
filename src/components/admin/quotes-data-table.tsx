"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  BadgeDollarSign,
  Edit3,
  FileText,
  ImagePlus,
  MoreHorizontal,
  Plus,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { adminDeleteQuoteAction } from "@/app/actions/quote-actions";
import { adminCreateSaleFromQuoteAction } from "@/app/actions/sales-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { toast } from "react-toastify";
import { useFormStatus } from "react-dom";

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

type QuoteRow = {
  id: string;
  code: string;
  clientName: string;
  itemsCount: number;
  total: number;
  status: QuoteStatus;
  createdAt: string;
  createdAtISO: string;
  shareToken: string;
  hasSale: boolean;
};

type AccountType = "CASH" | "BANK" | "WALLET" | "OTHER";

type AccountOption = {
  id: string;
  name: string;
  type: AccountType;
};

type QuotesDataTableProps = {
  quotes: QuoteRow[];
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
};

type SaleAttachmentDraft = {
  id: string;
  amount: string;
  file: File | null;
  previewUrl: string | null;
  accountId: string;
  note: string;
  paymentDate: string;
};

function todayInputValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function firstDayOfMonthInput(): string {
  return `${todayInputValue().slice(0, 8)}01`;
}

// Convierte un instante ISO (UTC) al día en la zona horaria local del navegador.
function isoToLocalDay(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const STATUS_FILTER_OPTIONS: QuoteStatus[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];
const DEFAULT_STATUS_FILTER: QuoteStatus[] = ["DRAFT", "SENT", "EXPIRED"];

type SaleInstallmentValidation = {
  canSubmit: boolean;
  capitalTotal: number;
  totalInstallments: number;
  remainingBalance: number;
  summaryErrors: string[];
  installmentErrors: Record<string, string[]>;
};

const ALLOWED_RECEIPT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const ALLOWED_RECEIPT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

function statusLabel(status: QuoteStatus): string {
  switch (status) {
    case "DRAFT":
      return "Revisión";
    case "SENT":
      return "Enviada";
    case "ACCEPTED":
      return "Aceptada";
    case "REJECTED":
      return "Rechazada";
    case "EXPIRED":
      return "Expirada";
    default:
      return status;
  }
}

function statusBadgeClassName(status: QuoteStatus): string {
  switch (status) {
    case "DRAFT":
      return "border-border bg-muted text-muted-foreground";
    case "SENT":
      return "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "ACCEPTED":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "REJECTED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "EXPIRED":
      return "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function getAttachmentValidationError(file: File): string | null {
  if (!(file instanceof File) || file.size <= 0) {
    return "No se pudo leer uno de los archivos adjuntos.";
  }

  if (file.size > MAX_RECEIPT_BYTES) {
    return `El archivo ${file.name} supera el tamaño máximo permitido de 12 MB.`;
  }

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const isAllowedType = ALLOWED_RECEIPT_MIME_TYPES.has(file.type) || ALLOWED_RECEIPT_EXTENSIONS.has(extension);

  if (!isAllowedType) {
    return `El archivo ${file.name} no es compatible. Solo se aceptan JPG, PNG, WEBP o PDF.`;
  }

  return null;
}

function parseMoneyInput(value: string): number {
  const normalizedValue = value.trim();
  if (!normalizedValue) return Number.NaN;

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN;
}

function validateSaleInstallments({
  quoteTotal,
  discountAmount,
  installments,
  accounts,
}: {
  quoteTotal: number;
  discountAmount: string;
  installments: SaleAttachmentDraft[];
  accounts: AccountOption[];
}): SaleInstallmentValidation {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const parsedDiscount = parseMoneyInput(discountAmount);
  const discountIsValid = Number.isFinite(parsedDiscount) && parsedDiscount >= 0 && parsedDiscount < quoteTotal;
  const discountValue = discountIsValid ? parsedDiscount : 0;
  const capitalTotal = Math.max(quoteTotal - discountValue, 0);

  const summaryErrors: string[] = [];
  const installmentErrors: Record<string, string[]> = {};
  let totalInstallments = 0;

  if (installments.length === 0) {
    summaryErrors.push("Agrega al menos un abono.");
  }

  if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) {
    summaryErrors.push("El descuento debe ser un número válido y no puede ser negativo.");
  } else if (parsedDiscount >= quoteTotal) {
    summaryErrors.push("El descuento debe ser menor al valor bruto de la cotización.");
  }

  installments.forEach((installment) => {
    const errors: string[] = [];
    const amount = parseMoneyInput(installment.amount);
    const hasValidAmount = Number.isFinite(amount) && amount > 0;
    const selectedAccount = installment.accountId ? accountById.get(installment.accountId) : undefined;
    const hasAccount = Boolean(selectedAccount);
    const requiresReceipt = hasAccount && selectedAccount?.type !== "CASH";

    if (!hasValidAmount) {
      errors.push("Ingresa un monto válido mayor a cero.");
    } else {
      totalInstallments += amount;
    }

    if (!hasAccount) {
      errors.push("Selecciona un método de pago.");
    }

    if (requiresReceipt && !installment.file) {
      errors.push("Adjunta el comprobante de pago.");
    }

    if (installment.file) {
      const receiptError = getAttachmentValidationError(installment.file);
      if (receiptError) {
        errors.push(receiptError);
      }
    }

    if (errors.length > 0) {
      installmentErrors[installment.id] = errors;
    }
  });

  if (totalInstallments > capitalTotal) {
    summaryErrors.push("La suma de los abonos no puede superar el capital neto de la venta.");
  }

  const hasInstallmentErrors = Object.keys(installmentErrors).length > 0;
  const canSubmit = summaryErrors.length === 0 && !hasInstallmentErrors && totalInstallments > 0;

  return {
    canSubmit,
    capitalTotal,
    totalInstallments,
    remainingBalance: capitalTotal - totalInstallments,
    summaryErrors,
    installmentErrors,
  };
}

function RowActions({
  quote,
  onDelete,
  onSendToSales,
}: {
  quote: QuoteRow;
  onDelete: () => void;
  onSendToSales: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones ${quote.code}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/cotizaciones/${quote.shareToken}`} target="_blank" rel="noopener noreferrer">
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Abrir
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/cotizaciones/${quote.id}`}>
            <Edit3 className="mr-2 h-4 w-4" />
            Editar
          </Link>
        </DropdownMenuItem>
        {quote.hasSale ? (
          <DropdownMenuItem asChild>
            <Link href={`/admin/ventas?q=${encodeURIComponent(quote.code)}`}>
              <BadgeDollarSign className="mr-2 h-4 w-4" />
              Ver venta
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={onSendToSales}
            className="text-emerald-600 hover:text-emerald-600 focus:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400 dark:focus:text-emerald-400"
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Enviar a ventas
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive hover:text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SaleSubmitButton({ disabled, className }: { disabled: boolean; className?: string }) {
  const { pending } = useFormStatus();

  return (
    <div className="space-y-2">
      <Button
        type="submit"
        className={className ? `bg-primary text-primary-foreground hover:bg-primary/90 ${className}` : "bg-primary text-primary-foreground hover:bg-primary/90"}
        disabled={pending || disabled}
      >
        {pending ? "Enviando..." : "Enviar a ventas"}
      </Button>
      {pending ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
        </div>
      ) : null}
    </div>
  );
}

function SaleInstallmentCard({
  installment,
  currency,
  accounts,
  active,
  errors,
  onClick,
  onRemove,
}: {
  installment: SaleAttachmentDraft;
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
  active: boolean;
  errors?: string[];
  onClick: () => void;
  onRemove: () => void;
}) {
  const hasFile = Boolean(installment.file);
  const accountName = accounts.find((account) => account.id === installment.accountId)?.name ?? "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`group flex w-full cursor-pointer gap-3 rounded-xl border p-3 text-left transition-colors ${
        active ? "border-ring bg-muted/60 shadow-sm" : "border-border bg-background hover:bg-muted/30"
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted/60 text-muted-foreground">
        <BadgeDollarSign className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              Abono {installment.amount ? formatMoney(Number(installment.amount || 0), currency) : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {accountName || "Sin método"}
              {hasFile ? " · Con comprobante" : " · Sin comprobante"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label="Eliminar abono"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {installment.note ? <p className="text-xs text-muted-foreground">{installment.note}</p> : null}
        {errors && errors.length > 0 ? <p className="text-xs text-destructive">{errors.join(" · ")}</p> : null}
      </div>
    </div>
  );
}

function SaleInstallmentEditor({
  installment,
  currency,
  accounts,
  onAmountChange,
  onAccountChange,
  onReceiptChange,
  onNoteChange,
  onPaymentDateChange,
  errors,
}: {
  installment: SaleAttachmentDraft;
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
  onAmountChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onReceiptChange: (file: File | null) => void;
  onNoteChange: (value: string) => void;
  onPaymentDateChange: (value: string) => void;
  errors?: string[];
}) {
  const amountId = `payment-amount-${installment.id}`;
  const methodId = `payment-method-${installment.id}`;
  const receiptId = `payment-receipt-${installment.id}`;
  const receiptHelpId = `payment-receipt-help-${installment.id}`;
  const noteId = `payment-note-${installment.id}`;
  const dateId = `payment-date-${installment.id}`;
  const selectedAccount = accounts.find((account) => account.id === installment.accountId);
  const requiresReceipt = Boolean(selectedAccount) && selectedAccount?.type !== "CASH";
  const receiptHelperText =
    selectedAccount && selectedAccount.type === "CASH"
      ? "Opcional para cuentas de efectivo."
      : "Requerido para cuentas que no son de efectivo.";

  const isImageReceipt = Boolean(installment.previewUrl);

  return (
    <div className="space-y-4">
      {/* Fecha del abono (el título ya lo da el header del modal) */}
      <div className="space-y-1">
        <DatePicker
          id={dateId}
          max={todayInputValue()}
          value={installment.paymentDate}
          onChange={onPaymentDateChange}
          className="w-40"
        />
        {errors && errors.length > 0 ? <p className="text-xs text-destructive">{errors.join(" · ")}</p> : null}
      </div>

      {/* Comprobante a la izquierda, campos a la derecha */}
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Comprobante</span>
          <label
            htmlFor={receiptId}
            className="group relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 transition hover:border-ring hover:bg-muted/60 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
            title="Subir comprobante"
          >
            <Input
              key={
                installment.file
                  ? `${installment.file.name}-${installment.file.size}-${installment.file.lastModified}`
                  : "empty"
              }
              id={receiptId}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              aria-describedby={receiptHelpId}
              aria-required={requiresReceipt}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              onChange={(event) => onReceiptChange(event.currentTarget.files?.[0] ?? null)}
            />
            {isImageReceipt ? (
              <>
                <img src={installment.previewUrl ?? ""} alt="Comprobante" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-[11px] font-medium">Cambiar</span>
                </div>
              </>
            ) : installment.file ? (
              <div className="flex flex-col items-center gap-1 px-2 text-center text-muted-foreground">
                <FileText className="h-6 w-6" />
                <span className="line-clamp-2 break-all text-[11px] font-medium text-foreground" title={installment.file.name}>
                  {installment.file.name}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Upload className="h-5 w-5" />
                <span className="text-[11px] font-medium">Agregar</span>
              </div>
            )}
          </label>
          {installment.file ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0 text-xs text-muted-foreground"
              onClick={() => onReceiptChange(null)}
            >
              Quitar comprobante
            </Button>
          ) : null}
          <p id={receiptHelpId} className="text-[11px] leading-relaxed text-muted-foreground">
            {receiptHelperText}
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={amountId} className="text-xs font-medium text-foreground">
              Monto de abono
            </label>
            <MoneyInput
              id={amountId}
              value={installment.amount}
              onValueChange={(raw) => onAmountChange(raw)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={methodId} className="text-xs font-medium text-foreground">
              Metodo de pago del abono
            </label>
            <Select
              value={installment.accountId || null}
              onValueChange={(value) => onAccountChange(value ?? "")}
            >
              <SelectTrigger id={methodId} className="h-10 w-full">
                <SelectValue placeholder="Seleccionar metodo">
                  {(value) =>
                    accounts.find((account) => account.id === value)?.name ??
                    "Seleccionar metodo"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.length === 0 ? (
              <p className="text-xs text-destructive">
                No hay cuentas registradas. Crea una en Balances → Cuentas.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={noteId} className="text-xs font-medium text-foreground">
              Observacion opcional
            </label>
            <Textarea
              id={noteId}
              value={installment.note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Ej: Abono 1 de 3"
              className="min-h-20 resize-none bg-background"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SaleInstallmentSubmissionBridge({
  installments,
  fileInputRefs,
}: {
  installments: SaleAttachmentDraft[];
  fileInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
}) {
  React.useEffect(() => {
    installments.forEach((installment) => {
      const input = fileInputRefs.current[installment.id];
      if (!input || typeof DataTransfer === "undefined") return;

      const dataTransfer = new DataTransfer();
      if (installment.file) {
        dataTransfer.items.add(installment.file);
      }

      input.files = dataTransfer.files;
    });
  }, [installments, fileInputRefs]);

  return (
    <>
      {installments.map((installment) => (
        <div key={installment.id} className="hidden">
          <input type="hidden" name="paymentReceiptAmounts" value={installment.amount} />
          <input type="hidden" name="paymentReceiptAccounts" value={installment.accountId} />
          <input type="hidden" name="paymentReceiptNotes" value={installment.note} />
          <input type="hidden" name="paymentReceiptDates" value={installment.paymentDate} />
          <input type="hidden" name="paymentReceiptHasFile" value={installment.file ? "true" : "false"} />
          <input
            ref={(node) => {
              fileInputRefs.current[installment.id] = node;
            }}
            type="file"
            name="paymentReceipts"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          />
        </div>
      ))}
    </>
  );
}

function SaleInstallmentsModal({
  open,
  quote,
  currency,
  accounts,
  installments,
  selectedInstallmentId,
  discountAmount,
  attachmentError,
  validation,
  onClose,
  onAddInstallment,
  onRemoveInstallment,
  onSelectInstallment,
  onAttachmentAmountChange,
  onAccountChange,
  onReceiptChange,
  onNoteChange,
  onPaymentDateChange,
  onDiscountAmountChange,
  onSubmit,
}: {
  open: boolean;
  quote: QuoteRow | null;
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
  installments: SaleAttachmentDraft[];
  selectedInstallmentId: string | null;
  discountAmount: string;
  attachmentError: string;
  validation: SaleInstallmentValidation;
  onClose: () => void;
  onAddInstallment: () => void;
  onRemoveInstallment: (id: string) => void;
  onSelectInstallment: (id: string | null) => void;
  onAttachmentAmountChange: (id: string, value: string) => void;
  onAccountChange: (id: string, value: string) => void;
  onReceiptChange: (id: string, file: File | null) => void;
  onNoteChange: (id: string, value: string) => void;
  onPaymentDateChange: (id: string, value: string) => void;
  onDiscountAmountChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  // El abono en edición se abre en su propio modal; solo existe cuando hay uno
  // seleccionado explícitamente (sin caer al primero por defecto).
  const editingInstallment = selectedInstallmentId
    ? installments.find((item) => item.id === selectedInstallmentId) ?? null
    : null;
  const fileInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open || !quote) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex min-h-[100dvh] items-start justify-center p-0 sm:p-4">
        <div className="flex min-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-background shadow-2xl sm:min-h-0 sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-border">
          <div className="flex items-start justify-between gap-4 border-b border-border bg-background px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  <span>Enviar a ventas</span>
                </h2>
                <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
                  {quote.code}
                </Badge>
                <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
                  {installments.length} abonos
                </Badge>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form action={adminCreateSaleFromQuoteAction} className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="discountAmount" value={discountAmount} />

            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-5">
              <div className="mx-auto max-w-2xl space-y-4">
                <div className="rounded-2xl border border-border bg-card p-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-semibold text-foreground">{formatMoney(validation.capitalTotal, currency)}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="discountAmount">
                        Descuento
                      </label>
                      <MoneyInput
                        id="discountAmount"
                        value={discountAmount}
                        onValueChange={(raw) => onDiscountAmountChange(raw)}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Abonos</p>
                      <p className="font-semibold text-foreground">{formatMoney(validation.totalInstallments, currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Restante</p>
                      <p className="font-semibold text-foreground">{formatMoney(validation.remainingBalance, currency)}</p>
                    </div>
                  </div>
                </div>

                {installments.length === 0 ? (
                  <div className="flex justify-center py-2">
                    <Button type="button" size="lg" className="gap-2" onClick={onAddInstallment}>
                      <Plus className="h-4 w-4" />
                      Agregar abono
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Abonos</h3>
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onAddInstallment}>
                        <Plus className="h-4 w-4" />
                        Agregar otro
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {installments.map((installment) => (
                        <SaleInstallmentCard
                          key={installment.id}
                          installment={installment}
                          currency={currency}
                          accounts={accounts}
                          active={installment.id === editingInstallment?.id}
                          errors={validation.installmentErrors[installment.id]}
                          onClick={() => onSelectInstallment(installment.id)}
                          onRemove={() => onRemoveInstallment(installment.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {validation.summaryErrors.length > 0 || attachmentError ? (
                  <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{attachmentError || validation.summaryErrors[0]}</p>
                    </div>
                    {validation.summaryErrors.length > 1 ? (
                      <ul className="space-y-1 pl-6 text-xs">
                        {validation.summaryErrors.slice(1).map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <SaleInstallmentSubmissionBridge installments={installments} fileInputRefs={fileInputRefs} />

            <footer className="border-t border-border bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                  <SaleSubmitButton disabled={!validation.canSubmit} className="w-full sm:w-auto" />
                </div>
              </div>
            </footer>
          </form>
        </div>
      </div>

      {editingInstallment ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Detalle del abono"
          onClick={() => onSelectInstallment(null)}
        >
          <div
            className="flex min-h-[100dvh] w-full max-w-2xl flex-col bg-background shadow-2xl sm:min-h-0 sm:rounded-2xl sm:border sm:border-border"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <h3 className="text-sm font-semibold text-foreground">Detalle del abono</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => onSelectInstallment(null)}
                aria-label="Cerrar detalle del abono"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <SaleInstallmentEditor
                installment={editingInstallment}
                currency={currency}
                accounts={accounts}
                onAmountChange={(value) => onAttachmentAmountChange(editingInstallment.id, value)}
                onAccountChange={(value) => onAccountChange(editingInstallment.id, value)}
                onReceiptChange={(file) => onReceiptChange(editingInstallment.id, file)}
                onNoteChange={(value) => onNoteChange(editingInstallment.id, value)}
                onPaymentDateChange={(value) => onPaymentDateChange(editingInstallment.id, value)}
                errors={validation.installmentErrors[editingInstallment.id]}
              />
            </div>
            <div className="border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
              <div className="flex justify-end">
                <Button type="button" onClick={() => onSelectInstallment(null)} className="w-full sm:w-auto">
                  Listo
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function QuotesDataTable({ quotes, currency, accounts }: QuotesDataTableProps) {
  const [statusFilter, setStatusFilter] = React.useState<QuoteStatus[]>(DEFAULT_STATUS_FILTER);
  const [dateFrom, setDateFrom] = React.useState(firstDayOfMonthInput());
  const [dateTo, setDateTo] = React.useState(todayInputValue());
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; code: string } | null>(null);
  const [pendingSale, setPendingSale] = React.useState<QuoteRow | null>(null);
  const [discountAmount, setDiscountAmount] = React.useState("0");
  const [saleAttachments, setSaleAttachments] = React.useState<SaleAttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = React.useState("");
  const [selectedAttachmentId, setSelectedAttachmentId] = React.useState<string | null>(null);
  const saleLoadingToastRef = React.useRef<string | number | null>(null);
  const saleAttachmentsRef = React.useRef<SaleAttachmentDraft[]>([]);

  React.useEffect(() => {
    saleAttachmentsRef.current = saleAttachments;
  }, [saleAttachments]);

  React.useEffect(() => {
    return () => {
      saleAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, []);

  React.useEffect(() => {
    if (!pendingSale && saleLoadingToastRef.current) {
      toast.dismiss(saleLoadingToastRef.current);
      saleLoadingToastRef.current = null;
    }
  }, [pendingSale]);

  // El filtro por estado y fecha vive aquí (alimenta las tarjetas de stats); la
  // búsqueda de texto la maneja el buscador integrado del DataTable.
  const filteredQuotes = React.useMemo(() => {
    return quotes.filter((quote) => {
      if (!statusFilter.includes(quote.status)) return false;
      const day = isoToLocalDay(quote.createdAtISO);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [quotes, statusFilter, dateFrom, dateTo]);

  const stats = React.useMemo(() => {
    const accepted = filteredQuotes.filter((quote) => quote.status === "ACCEPTED");
    return {
      count: filteredQuotes.length,
      total: filteredQuotes.reduce((sum, quote) => sum + quote.total, 0),
      acceptedCount: accepted.length,
      acceptedTotal: accepted.reduce((sum, quote) => sum + quote.total, 0),
    };
  }, [filteredQuotes]);

  const toggleStatusFilter = React.useCallback((status: QuoteStatus) => {
    setStatusFilter((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    );
  }, []);

  const resetFilters = React.useCallback(() => {
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setDateFrom(firstDayOfMonthInput());
    setDateTo(todayInputValue());
  }, []);

  const saleValidation = React.useMemo(() => {
    return validateSaleInstallments({
      quoteTotal: pendingSale?.total ?? 0,
      discountAmount,
      installments: saleAttachments,
      accounts,
    });
  }, [accounts, discountAmount, pendingSale?.total, saleAttachments]);

  React.useEffect(() => {
    if (!attachmentError) return;
    if (saleValidation.summaryErrors.length === 0 && Object.keys(saleValidation.installmentErrors).length === 0) {
      setAttachmentError("");
    }
  }, [attachmentError, saleValidation.installmentErrors, saleValidation.summaryErrors]);

  const closeSaleModal = React.useCallback(() => {
    saleAttachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    saleLoadingToastRef.current = null;
    setPendingSale(null);
    setDiscountAmount("0");
    setSaleAttachments([]);
    setAttachmentError("");
    setSelectedAttachmentId(null);
  }, []);

  const openSaleModal = React.useCallback(
    (quote: QuoteRow) => {
      closeSaleModal();
      setPendingSale(quote);
      setDiscountAmount("0");
      setAttachmentError("");
      // Arranca sin abonos: se muestra el botón "Agregar abono" centrado.
      setSaleAttachments([]);
      setSelectedAttachmentId(null);
    },
    [closeSaleModal],
  );

  const createSaleAttachment = React.useCallback(
    (overrides?: Partial<SaleAttachmentDraft>): SaleAttachmentDraft => ({
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      amount: "",
      file: null,
      previewUrl: null,
      accountId: "",
      note: "",
      paymentDate: todayInputValue(),
      ...overrides,
    }),
    [],
  );

  const addSaleAttachment = React.useCallback(() => {
    // Se crea el abono con un id estable y se selecciona enseguida para que se
    // abra su modal de detalle al instante.
    const attachment = createSaleAttachment();
    setSaleAttachments((current) => [...current, attachment]);
    setSelectedAttachmentId(attachment.id);
  }, [createSaleAttachment]);

  const removeAttachment = React.useCallback(
    (attachmentId: string) => {
      setSaleAttachments((current) => {
        const attachment = current.find((item) => item.id === attachmentId);
        if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);

        const nextAttachments = current.filter((item) => item.id !== attachmentId);
        return nextAttachments;
      });

      // Si se borra el abono que estaba abierto en el modal, se cierra (null) en
      // vez de saltar a otro abono automáticamente.
      setSelectedAttachmentId((currentSelected) => (currentSelected === attachmentId ? null : currentSelected));
    },
    [],
  );

  const updateAttachmentAmount = React.useCallback((attachmentId: string, value: string) => {
    setSaleAttachments((current) => current.map((item) => (item.id === attachmentId ? { ...item, amount: value } : item)));
  }, []);

  const updateAttachmentAccount = React.useCallback((attachmentId: string, value: string) => {
    setSaleAttachments((current) => current.map((item) => (item.id === attachmentId ? { ...item, accountId: value } : item)));
  }, []);

  const updateAttachmentFile = React.useCallback((attachmentId: string, file: File | null) => {
    setSaleAttachments((current) =>
      current.map((item) => {
        if (item.id !== attachmentId) return item;

        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }

        if (!file) {
          return { ...item, file: null, previewUrl: null };
        }

        const validationError = getAttachmentValidationError(file);
        if (validationError) {
          setAttachmentError(validationError);
          return item;
        }

        setAttachmentError("");
        return { ...item, file, previewUrl: URL.createObjectURL(file) };
      }),
    );
  }, []);

  const updateAttachmentNote = React.useCallback((attachmentId: string, value: string) => {
    setSaleAttachments((current) => current.map((item) => (item.id === attachmentId ? { ...item, note: value } : item)));
  }, []);

  const updateAttachmentPaymentDate = React.useCallback((attachmentId: string, value: string) => {
    setSaleAttachments((current) => current.map((item) => (item.id === attachmentId ? { ...item, paymentDate: value } : item)));
  }, []);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const forms = document.querySelectorAll<HTMLFormElement>(`form[data-delete-quote-id="${pendingDelete.id}"]`);
    const form = Array.from(forms).find((candidate) => candidate.offsetParent !== null) ?? forms[0] ?? null;
    form?.requestSubmit();
    setPendingDelete(null);
  };

  const handleSaleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!pendingSale) {
      event.preventDefault();
      setAttachmentError("No hay una cotización activa.");
      return;
    }

    if (!saleValidation.canSubmit) {
      event.preventDefault();
      setAttachmentError(saleValidation.summaryErrors[0] || "Completa los datos de los abonos antes de enviar.");
      return;
    }

    saleLoadingToastRef.current = toast.loading("Enviando a ventas...");
  };


  const columns = React.useMemo<ColumnDef<QuoteRow, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Cotizacion",
        cell: ({ row }) => <p className="text-sm font-semibold text-foreground">{row.original.code}</p>,
      },
      {
        accessorKey: "clientName",
        header: "Cliente",
        cell: ({ row }) => <span className="text-sm text-foreground">{row.original.clientName}</span>,
      },
      {
        id: "estado",
        accessorFn: (row) => statusLabel(row.status),
        header: "Estado",
        cell: ({ row }) => (
          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(row.original.status)}`}>
            {statusLabel(row.original.status)}
          </span>
        ),
      },
      {
        accessorKey: "total",
        header: "Total",
        cell: ({ row }) => (
          <span className="text-sm font-semibold text-foreground">{formatMoney(row.original.total, currency)}</span>
        ),
      },
      {
        id: "fecha",
        accessorFn: (row) => row.createdAtISO,
        header: "Fecha",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.createdAt}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <form data-delete-quote-id={row.original.id} action={adminDeleteQuoteAction}>
              <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
              <input type="hidden" name="quoteId" value={row.original.id} />
            </form>
            <RowActions
              quote={row.original}
              onDelete={() => setPendingDelete({ id: row.original.id, code: row.original.code })}
              onSendToSales={() => openSaleModal(row.original)}
            />
          </div>
        ),
      },
    ],
    [currency, openSaleModal],
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Cotizaciones</p>
            <p className="text-lg font-semibold text-foreground">{stats.count}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Valor total</p>
            <p className="text-lg font-semibold text-foreground">{formatMoney(stats.total, currency)}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Aceptadas</p>
            <p className="text-lg font-semibold text-foreground">{stats.acceptedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Valor aceptado</p>
            <p className="text-lg font-semibold text-foreground">{formatMoney(stats.acceptedTotal, currency)}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={filteredQuotes}
        columns={columns}
        searchPlaceholder="Buscar por código o cliente"
        emptyMessage="No hay cotizaciones con los filtros seleccionados."
        initialSorting={[{ id: "code", desc: true }]}
        minWidth="min-w-[900px]"
        searchFirst
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2">
                  <span>
                    {statusFilter.length === 0
                      ? "Ninguno"
                      : statusFilter.length === STATUS_FILTER_OPTIONS.length
                        ? "Todos los estados"
                        : `${statusFilter.length} seleccionados`}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Filtrar por estado</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STATUS_FILTER_OPTIONS.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilter.includes(status)}
                    onCheckedChange={() => toggleStatusFilter(status)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {statusLabel(status)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-1.5">
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={(range) => {
                  setDateFrom(range.from);
                  setDateTo(range.to);
                }}
                aria-label="Rango de fechas"
                className="sm:w-64"
                placeholder="Rango de fechas"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={resetFilters}
                aria-label="Limpiar filtros"
                title="Limpiar filtros"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        }
        renderMobileCard={(quote) => (
          <article className="space-y-2.5 rounded-xl border border-border bg-card p-3">
            <form data-delete-quote-id={quote.id} action={adminDeleteQuoteAction}>
              <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
              <input type="hidden" name="quoteId" value={quote.id} />
            </form>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{quote.code}</p>
                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(quote.status)}`}>
                  {statusLabel(quote.status)}
                </span>
              </div>
              <p className="text-sm text-foreground">{quote.clientName}</p>
              <p className="text-xs text-muted-foreground">{quote.createdAt}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(quote.total, currency)}</p>
            </div>
            <div className="flex items-center justify-end">
              <RowActions quote={quote} onDelete={() => setPendingDelete({ id: quote.id, code: quote.code })} onSendToSales={() => openSaleModal(quote)} />
            </div>
          </article>
        )}
      />

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminacion"
          onClick={() => setPendingDelete(null)}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Eliminar cotizacion</h3>
              <p className="text-sm text-muted-foreground">
                Se eliminara <span className="font-medium text-foreground">{pendingDelete.code}</span>. Esta accion no se puede deshacer.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" className="bg-destructive text-white hover:bg-destructive/90" onClick={confirmDelete}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <SaleInstallmentsModal
        open={Boolean(pendingSale)}
        quote={pendingSale}
        currency={currency}
        accounts={accounts}
        installments={saleAttachments}
        selectedInstallmentId={selectedAttachmentId}
        discountAmount={discountAmount}
        attachmentError={attachmentError}
        validation={saleValidation}
        onClose={closeSaleModal}
        onAddInstallment={addSaleAttachment}
        onRemoveInstallment={removeAttachment}
        onSelectInstallment={setSelectedAttachmentId}
        onAttachmentAmountChange={updateAttachmentAmount}
        onAccountChange={updateAttachmentAccount}
        onReceiptChange={updateAttachmentFile}
        onNoteChange={updateAttachmentNote}
        onPaymentDateChange={updateAttachmentPaymentDate}
        onDiscountAmountChange={setDiscountAmount}
        onSubmit={handleSaleSubmit}
      />
    </div>
  );
}
