"use client";

import Link from "next/link";
import * as React from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  BadgeDollarSign,
  Edit3,
  FileText,
  MoreHorizontal,
  Paintbrush,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
  User2,
  X,
} from "lucide-react";
import { adminDeleteQuoteAction } from "@/app/actions/quote-actions";
import { adminCreateSaleFromQuoteAction } from "@/app/actions/sales-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { toast } from "react-toastify";
import { useFormStatus } from "react-dom";

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
type SortKey = "cotizacion" | "cliente" | "estado" | "total" | "fecha" | "acciones";
type SortDirection = "asc" | "desc";

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

function HeaderLabel({
  children,
  active,
  direction,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Button type="button" variant="ghost" onClick={onClick} aria-label={`Ordenar por ${String(children)}`}>
      <span className="text-muted-foreground">{icon}</span>
      {children}
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 text-foreground" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5 text-foreground" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </Button>
  );
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
        <DropdownMenuItem onClick={onSendToSales} disabled={quote.hasSale}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          {quote.hasSale ? "Enviado a ventas" : "Enviar a ventas"}
        </DropdownMenuItem>
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

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Detalle del abono</p>
          {errors && errors.length > 0 ? <p className="text-xs text-destructive">{errors.join(" · ")}</p> : null}
        </div>
        <div className="shrink-0 space-y-1">
          <Input
            id={dateId}
            type="date"
            max={todayInputValue()}
            value={installment.paymentDate}
            onChange={(event) => onPaymentDateChange(event.target.value)}
            className="w-40"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={amountId} className="text-xs font-medium text-foreground">
            Monto de abono
          </label>
          <Input
            id={amountId}
            type="number"
            min="0.01"
            step="0.01"
            required
            value={installment.amount}
            onChange={(event) => onAmountChange(event.target.value)}
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
              <SelectValue placeholder="Seleccionar metodo" />
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={receiptId} className="text-xs font-medium text-foreground">
            Comprobante de pago del abono
          </label>
          <div className="relative flex min-h-28 flex-col justify-between rounded-lg border border-dashed border-border bg-background p-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/20">
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
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                <Upload className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {installment.file ? "Cambiar comprobante" : "Seleccionar archivo"}
                </span>
                <span
                  className="mt-0.5 block truncate text-xs text-muted-foreground"
                  title={installment.file?.name}
                >
                  {installment.file ? installment.file.name : "PDF, JPG, PNG o WEBP (max. 12 MB)"}
                </span>
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p id={receiptHelpId} className="text-xs leading-relaxed text-muted-foreground">
                {receiptHelperText}
              </p>
              {installment.file ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="relative z-20 shrink-0 text-muted-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onReceiptChange(null);
                  }}
                  aria-label="Quitar comprobante"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
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
            className="min-h-28 resize-none bg-background"
          />
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
  const selectedInstallment = installments.find((item) => item.id === selectedInstallmentId) ?? installments[0] ?? null;
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
        <div className="flex min-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-background shadow-2xl sm:min-h-0 sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-border">
          <div className="flex items-start justify-between gap-4 border-b border-border bg-background px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">Enviar a ventas</h2>
                <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
                  {quote.code}
                </Badge>
                <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
                  {installments.length} abonos
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Registra cada abono con su metodo, comprobante y observacion opcional.
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form action={adminCreateSaleFromQuoteAction} className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="discountAmount" value={discountAmount} />

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <aside className="min-h-0 border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="font-semibold text-foreground">{formatMoney(validation.capitalTotal, currency)}</p>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="discountAmount">
                          Descuento
                        </label>
                        <Input
                          id="discountAmount"
                          type="number"
                          min="0"
                          step="0.01"
                          max={quote.total}
                          value={discountAmount}
                          onChange={(event) => onDiscountAmountChange(event.target.value)}
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
                          active={installment.id === selectedInstallment?.id}
                          errors={validation.installmentErrors[installment.id]}
                          onClick={() => onSelectInstallment(installment.id)}
                          onRemove={() => onRemoveInstallment(installment.id)}
                        />
                      ))}
                    </div>
                  </div>

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
              </aside>

              <section className="min-h-0 bg-background p-4 sm:p-5">
                <div className="space-y-3">
                  {selectedInstallment ? (
                    <SaleInstallmentEditor
                      installment={selectedInstallment}
                      currency={currency}
                      accounts={accounts}
                      onAmountChange={(value) => onAttachmentAmountChange(selectedInstallment.id, value)}
                      onAccountChange={(value) => onAccountChange(selectedInstallment.id, value)}
                      onReceiptChange={(file) => onReceiptChange(selectedInstallment.id, file)}
                      onNoteChange={(value) => onNoteChange(selectedInstallment.id, value)}
                      onPaymentDateChange={(value) => onPaymentDateChange(selectedInstallment.id, value)}
                      errors={validation.installmentErrors[selectedInstallment.id]}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
                      <div className="max-w-sm space-y-2">
                        <p className="text-sm font-medium text-foreground">No hay abonos para editar</p>
                        <p className="text-sm text-muted-foreground">
                          Agrega un abono para empezar. Cada bloque guarda monto, metodo y comprobante.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <SaleInstallmentSubmissionBridge installments={installments} fileInputRefs={fileInputRefs} />

            <footer className="border-t border-border bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  El envío se habilita cuando todos los abonos tengan monto, método y comprobante válidos.
                </p>
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
    </div>
  );
}

export function QuotesDataTable({ quotes, currency, accounts }: QuotesDataTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("cotizacion");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [search, setSearch] = React.useState("");
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

  const filteredQuotes = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (!statusFilter.includes(quote.status)) return false;
      const day = isoToLocalDay(quote.createdAtISO);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (term && !`${quote.code} ${quote.clientName}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [quotes, search, statusFilter, dateFrom, dateTo]);

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
    setSearch("");
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setDateFrom(firstDayOfMonthInput());
    setDateTo(todayInputValue());
  }, []);

  const sortedQuotes = React.useMemo(() => {
    const list = [...filteredQuotes];
    const directionFactor = sortDirection === "asc" ? 1 : -1;
    const textCompare = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base", numeric: true });

    list.sort((a, b) => {
      switch (sortKey) {
        case "cotizacion":
        case "acciones":
          return textCompare(a.code, b.code) * directionFactor;
        case "cliente":
          return textCompare(a.clientName, b.clientName) * directionFactor;
        case "estado":
          return textCompare(statusLabel(a.status), statusLabel(b.status)) * directionFactor;
        case "total":
          return (a.total - b.total) * directionFactor;
        case "fecha":
          return textCompare(a.createdAt, b.createdAt) * directionFactor;
        default:
          return 0;
      }
    });

    return list;
  }, [filteredQuotes, sortDirection, sortKey]);

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

  const toggleSort = React.useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
        return;
      }

      setSortKey(key);
      setSortDirection("asc");
    },
    [sortKey],
  );

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
      setSaleAttachments([
        {
          id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
          amount: "",
          file: null,
          previewUrl: null,
          accountId: "",
          note: "",
          paymentDate: todayInputValue(),
        },
      ]);
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
    setSaleAttachments((current) => {
      const nextAttachments = [...current, createSaleAttachment()];
      setSelectedAttachmentId(nextAttachments[nextAttachments.length - 1]?.id ?? null);
      return nextAttachments;
    });
  }, [createSaleAttachment]);

  const removeAttachment = React.useCallback(
    (attachmentId: string) => {
      setSaleAttachments((current) => {
        const attachment = current.find((item) => item.id === attachmentId);
        if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);

        const nextAttachments = current.filter((item) => item.id !== attachmentId);
        return nextAttachments;
      });

      setSelectedAttachmentId((currentSelected) => {
        if (currentSelected !== attachmentId) return currentSelected;
        const next = saleAttachmentsRef.current.filter((item) => item.id !== attachmentId);
        return next[0]?.id ?? null;
      });
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

  const selectedAttachment = saleAttachments.find((item) => item.id === selectedAttachmentId) ?? saleAttachments[0] ?? null;

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

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Buscar por código o cliente"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Estados</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-2">
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
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-40"
              title="Desde"
              aria-label="Desde"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-40"
              title="Hasta"
              aria-label="Hasta"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={resetFilters}
              aria-label="Limpiar filtros"
              title="Limpiar filtros"
            >
              <Paintbrush className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel active={sortKey === "cotizacion"} direction={sortDirection} onClick={() => toggleSort("cotizacion")} icon={<FileText className="h-3.5 w-3.5" />}>
                  Cotizacion
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel active={sortKey === "cliente"} direction={sortDirection} onClick={() => toggleSort("cliente")} icon={<User2 className="h-3.5 w-3.5" />}>
                  Cliente
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel active={sortKey === "estado"} direction={sortDirection} onClick={() => toggleSort("estado")} icon={<FileText className="h-3.5 w-3.5" />}>
                  Estado
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel active={sortKey === "total"} direction={sortDirection} onClick={() => toggleSort("total")} icon={<FileText className="h-3.5 w-3.5" />}>
                  Total
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel active={sortKey === "fecha"} direction={sortDirection} onClick={() => toggleSort("fecha")} icon={<CalendarDays className="h-3.5 w-3.5" />}>
                  Fecha
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedQuotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-9 text-center text-muted-foreground">
                  No hay cotizaciones con los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              sortedQuotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell>
                    <p className="text-sm font-semibold text-foreground">{quote.code}</p>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{quote.clientName}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(quote.status)}`}>
                      {statusLabel(quote.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">{formatMoney(quote.total, currency)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{quote.createdAt}</TableCell>
                  <TableCell>
                    <form data-delete-quote-id={quote.id} action={adminDeleteQuoteAction}>
                      <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
                      <input type="hidden" name="quoteId" value={quote.id} />
                    </form>
                    <div className="flex items-center">
                      <RowActions quote={quote} onDelete={() => setPendingDelete({ id: quote.id, code: quote.code })} onSendToSales={() => openSaleModal(quote)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {sortedQuotes.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            No hay cotizaciones con los filtros seleccionados.
          </div>
        ) : (
          sortedQuotes.map((quote) => (
            <article key={quote.id} className="space-y-2.5 rounded-xl border border-border bg-card p-3">
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
          ))
        )}
      </div>

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
        selectedInstallmentId={selectedAttachment?.id ?? null}
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
