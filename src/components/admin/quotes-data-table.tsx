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
  BadgeDollarSign,
  CreditCard,
  Edit3,
  FileText,
  MoreHorizontal,
  Paperclip,
  Plus,
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { toast } from "sonner";
import { useFormStatus } from "react-dom";

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
type SortKey = "cotizacion" | "cliente" | "estado" | "total" | "fecha" | "acciones";
type SortDirection = "asc" | "desc";
type PaymentMethod = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO";

type QuoteRow = {
  id: string;
  code: string;
  clientName: string;
  itemsCount: number;
  total: number;
  status: QuoteStatus;
  createdAt: string;
  shareToken: string;
  hasSale: boolean;
};

type QuotesDataTableProps = {
  quotes: QuoteRow[];
  currency: SupportedCurrencyCode;
};

type SaleAttachmentDraft = {
  id: string;
  amount: string;
  file: File | null;
  previewUrl: string | null;
  paymentMethod: PaymentMethod | "";
  note: string;
};

type SaleInstallmentValidation = {
  canSubmit: boolean;
  capitalTotal: number;
  totalInstallments: number;
  remainingBalance: number;
  summaryErrors: string[];
  installmentErrors: Record<string, string[]>;
};

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "OTRO", label: "Otro" },
];

const ALLOWED_RECEIPT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const ALLOWED_RECEIPT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

function statusLabel(status: QuoteStatus): string {
  switch (status) {
    case "DRAFT":
      return "Borrador";
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

function paymentMethodLabel(value: PaymentMethod): string {
  return PAYMENT_METHOD_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentKind(file: File | null): "image" | "pdf" | "other" {
  if (!file) return "other";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) return "image";
  if (extension === ".pdf") return "pdf";
  return "other";
}

function getAttachmentValidationError(file: File): string | null {
  if (!(file instanceof File) || file.size <= 0) {
    return "No se pudo leer uno de los archivos adjuntos.";
  }

  if (file.size > MAX_RECEIPT_BYTES) {
    return `El archivo ${file.name} supera el tamaÃ±o mÃ¡ximo permitido de 12 MB.`;
  }

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const isAllowedType = ALLOWED_RECEIPT_MIME_TYPES.has(file.type) || ALLOWED_RECEIPT_EXTENSIONS.has(extension);

  if (!isAllowedType) {
    return `El archivo ${file.name} no es compatible. Solo se aceptan JPG, PNG, WEBP o PDF.`;
  }

  return null;
}

function normalizeFileName(name: string): string {
  return name.trim() || "archivo-adjunto";
}

function formatNumberInput(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "";
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
}: {
  quoteTotal: number;
  discountAmount: string;
  installments: SaleAttachmentDraft[];
}): SaleInstallmentValidation {
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
    summaryErrors.push("El descuento debe ser un nÃºmero vÃ¡lido y no puede ser negativo.");
  } else if (parsedDiscount >= quoteTotal) {
    summaryErrors.push("El descuento debe ser menor al valor bruto de la cotizaciÃ³n.");
  }

  installments.forEach((installment) => {
    const errors: string[] = [];
    const amount = parseMoneyInput(installment.amount);
    const hasValidAmount = Number.isFinite(amount) && amount > 0;
    const hasPaymentMethod = installment.paymentMethod !== "";
    const requiresReceipt = hasPaymentMethod && installment.paymentMethod !== "EFECTIVO";

    if (!hasValidAmount) {
      errors.push("Ingresa un monto vÃ¡lido mayor a cero.");
    } else {
      totalInstallments += amount;
    }

    if (!hasPaymentMethod) {
      errors.push("Selecciona un mÃ©todo de pago.");
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

function AttachmentThumb({ kind, previewUrl }: { kind: "image" | "pdf" | "other"; previewUrl: string | null }) {
  if (kind === "image" && previewUrl) {
    return (
      // Blob URLs are only available on the client and are revoked by the parent.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={previewUrl} alt="" className="h-16 w-16 rounded-xl border border-border object-cover" />
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted/60 text-muted-foreground">
      <FileText className="h-7 w-7" />
    </div>
  );
}

function AttachmentCard({
  attachment,
  active,
  onClick,
  onRemove,
}: {
  attachment: SaleAttachmentDraft;
  active: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const kind = getAttachmentKind(attachment.file);

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
      <AttachmentThumb kind={kind} previewUrl={attachment.previewUrl} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{attachment.file?.name ?? "Sin comprobante"}</p>
            <p className="text-xs text-muted-foreground">
              {kind === "image" ? "Imagen" : kind === "pdf" ? "PDF" : "Archivo"} Â· {formatFileSize(attachment.file!.size)}
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
            aria-label="Eliminar adjunto"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
            <Paperclip className="h-3 w-3" />
            {attachment.paymentMethod ? paymentMethodLabel(attachment.paymentMethod) : "Sin medio"}
          </Badge>
          {attachment.note ? (
            <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
              Nota
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AttachmentEditor({
  attachment,
  onPaymentMethodChange,
  onNoteChange,
}: {
  attachment: SaleAttachmentDraft;
  onPaymentMethodChange: (value: PaymentMethod | "") => void;
  onNoteChange: (value: string) => void;
}) {
  const kind = getAttachmentKind(attachment.file);
  const paymentMethodFieldId = `payment-method-${attachment.id}`;
  const noteFieldId = `payment-note-${attachment.id}`;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AttachmentThumb kind={kind} previewUrl={attachment.previewUrl} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold text-foreground">{attachment.file?.name ?? "Sin comprobante"}</p>
          <p className="text-xs text-muted-foreground">
            {kind === "image" ? "Imagen" : kind === "pdf" ? "PDF" : "Archivo"} Â· {formatFileSize(attachment.file!.size)}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
              <CreditCard className="h-3 w-3" />
              {attachment.paymentMethod ? paymentMethodLabel(attachment.paymentMethod) : "Medio pendiente"}
            </Badge>
            {attachment.note ? (
              <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
                ObservaciÃ³n activa
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={paymentMethodFieldId} className="text-xs font-medium text-foreground">
          Medio de pago
        </label>
        <select
          id={paymentMethodFieldId}
          name="paymentReceiptMethods"
          required
          value={attachment.paymentMethod}
          onChange={(event) => onPaymentMethodChange(event.target.value as PaymentMethod | "")}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Seleccionar medio de pago</option>
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={noteFieldId} className="text-xs font-medium text-foreground">
          ObservaciÃ³n opcional
        </label>
        <Textarea
          id={noteFieldId}
          name="paymentReceiptNotes"
          value={attachment.note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Ej: Tarjeta dÃ©bito Bancolombia â€” cuota 1 de 3"
          className="min-h-28 resize-none bg-background"
        />
      </div>
    </div>
  );
}

function SendToSalesModal({
  open,
  quote,
  currency,
  attachments,
  selectedAttachmentId,
  downPaymentAmount,
  discountAmount,
  attachmentError,
  isDragging,
  isSaleReady,
  onClose,
  onDrop,
  onDragStateChange,
  onOpenPicker,
  onFileInputChange,
  onRemoveAttachment,
  onSelectAttachment,
  onPaymentMethodChange,
  onNoteChange,
  onDownPaymentAmountChange,
  onDiscountAmountChange,
  onSubmit,
  fileInputRef,
}: {
  open: boolean;
  quote: QuoteRow | null;
  currency: SupportedCurrencyCode;
  attachments: SaleAttachmentDraft[];
  selectedAttachmentId: string | null;
  downPaymentAmount: string;
  discountAmount: string;
  attachmentError: string;
  isDragging: boolean;
  isSaleReady: boolean;
  onClose: () => void;
  onDrop: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragStateChange: (value: boolean) => void;
  onOpenPicker: () => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (id: string) => void;
  onSelectAttachment: (id: string) => void;
  onPaymentMethodChange: (id: string, value: PaymentMethod | "") => void;
  onNoteChange: (id: string, value: string) => void;
  onDownPaymentAmountChange: (value: string) => void;
  onDiscountAmountChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const selectedAttachment = attachments.find((item) => item.id === selectedAttachmentId) ?? attachments[0] ?? null;

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
      <div className="relative flex min-h-full items-start justify-center p-0 sm:p-4">
        <div className="flex min-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-background shadow-2xl sm:min-h-0 sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-border">
          <div className="flex items-start justify-between gap-4 border-b border-border bg-background px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">Enviar a ventas</h2>
                <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
                  {quote.code}
                </Badge>
                <Badge variant="outline" className="border-border bg-muted/40 text-foreground">
                  {attachments.length} adjuntos
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Adjunte comprobantes, asigne el medio de pago por archivo y deje observaciones si aplica.
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form action={adminCreateSaleFromQuoteAction} className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
          <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
          <input type="hidden" name="quoteId" value={quote.id} />
          <input
            ref={fileInputRef}
            type="file"
              name="paymentReceipts"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={onFileInputChange}
            />

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <aside className="min-h-0 border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r">
                <div className="space-y-4">
                  <div className="grid gap-3 rounded-2xl border border-border bg-card p-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Valor bruto</p>
                      <p className="font-semibold text-foreground">{formatMoney(quote.total, currency)}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="discountAmount">
                        Descuento
                      </label>
                      <Input
                        id="discountAmount"
                        name="discountAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        max={quote.total}
                        value={discountAmount}
                        onChange={(event) => onDiscountAmountChange(event.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Valor real</p>
                      <p className="font-semibold text-foreground">
                        {formatMoney(Math.max(quote.total - Number(discountAmount || 0), 0), currency)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="downPaymentAmount">
                      Monto del abono
                    </label>
                    <Input
                      id="downPaymentAmount"
                      name="downPaymentAmount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={downPaymentAmount}
                      onChange={(event) => onDownPaymentAmountChange(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Este valor es obligatorio antes de crear la venta.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-dashed border-border bg-background p-4 transition-colors">
                    <button
                      type="button"
                      onClick={onOpenPicker}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        onDragStateChange(true);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        onDragStateChange(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        onDragStateChange(false);
                      }}
                      onDrop={onDrop}
                      className={`flex w-full items-start gap-3 rounded-xl outline-none transition-colors ${
                        isDragging ? "bg-muted/60" : "hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                        <Upload className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-sm font-medium text-foreground">Arrastra archivos o haz clic para agregarlos</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          JPG, PNG, WEBP o PDF. Puedes agregar mÃ¡s archivos sin reiniciar el flujo.
                        </p>
                      </div>
                    </button>
                  </div>

                  {attachmentError ? (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{attachmentError}</p>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Adjuntos</h3>
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onOpenPicker}>
                        <Plus className="h-4 w-4" />
                        Agregar
                      </Button>
                    </div>

                    <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1 lg:max-h-[42vh]">
                      {attachments.length === 0 ? (
                        <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                          Aun no hay adjuntos. Agrega al menos un archivo con su medio de pago para habilitar el envÃ­o.
                        </div>
                      ) : (
                        attachments.map((attachment) => (
                          <AttachmentCard
                            key={attachment.id}
                            attachment={attachment}
                            active={attachment.id === selectedAttachment?.id}
                            onClick={() => onSelectAttachment(attachment.id)}
                            onRemove={() => onRemoveAttachment(attachment.id)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </aside>

              <section className="min-h-0 bg-background p-4 sm:p-5">
                <div className="flex min-h-0 flex-col gap-4">
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">CotizaciÃ³n</p>
                        <p className="font-semibold text-foreground">{quote.code}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Cliente</p>
                        <p className="font-semibold text-foreground">{quote.clientName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Estado</p>
                        <p className="font-semibold text-foreground">{quote.hasSale ? "Ya enviada" : "Lista para envÃ­o"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1">
                    {selectedAttachment ? (
                      <AttachmentEditor
                        attachment={selectedAttachment}
                        onPaymentMethodChange={(value) => onPaymentMethodChange(selectedAttachment.id, value)}
                        onNoteChange={(value) => onNoteChange(selectedAttachment.id, value)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
                        <div className="max-w-sm space-y-2">
                          <p className="text-sm font-medium text-foreground">No hay adjuntos para editar</p>
                          <p className="text-sm text-muted-foreground">
                            Agrega uno o mÃ¡s archivos para empezar. El detalle del archivo activo aparecerÃ¡ aquÃ­.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Adjuntos</p>
                        <p className="font-semibold text-foreground">{attachments.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Con medio</p>
                        <p className="font-semibold text-foreground">
                          {attachments.filter((attachment) => attachment.paymentMethod).length}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Listo para enviar</p>
                        <p className="font-semibold text-foreground">{isSaleReady ? "SÃ­" : "No"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <footer className="border-t border-border bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  El envÃ­o se habilita solo cuando exista al menos un adjunto con medio de pago seleccionado.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                  <SaleSubmitButton disabled={!isSaleReady || attachments.length === 0} className="w-full sm:w-auto" />
                </div>
              </div>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}

function SaleInstallmentCard({
  installment,
  currency,
  active,
  errors,
  onClick,
  onRemove,
}: {
  installment: SaleAttachmentDraft;
  currency: SupportedCurrencyCode;
  active: boolean;
  errors?: string[];
  onClick: () => void;
  onRemove: () => void;
}) {
  const hasFile = Boolean(installment.file);

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
              {installment.paymentMethod ? paymentMethodLabel(installment.paymentMethod) : "Sin mÃ©todo"}
              {hasFile ? " Â· Con comprobante" : " Â· Sin comprobante"}
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
        {errors && errors.length > 0 ? <p className="text-xs text-destructive">{errors.join(" Â· ")}</p> : null}
      </div>
    </div>
  );
}

function SaleInstallmentEditor({
  installment,
  currency,
  onAmountChange,
  onPaymentMethodChange,
  onReceiptChange,
  onNoteChange,
  errors,
}: {
  installment: SaleAttachmentDraft;
  currency: SupportedCurrencyCode;
  onAmountChange: (value: string) => void;
  onPaymentMethodChange: (value: PaymentMethod | "") => void;
  onReceiptChange: (file: File | null) => void;
  onNoteChange: (value: string) => void;
  errors?: string[];
}) {
  const amountId = `payment-amount-${installment.id}`;
  const methodId = `payment-method-${installment.id}`;
  const receiptId = `payment-receipt-${installment.id}`;
  const noteId = `payment-note-${installment.id}`;
  const requiresReceipt = installment.paymentMethod !== "" && installment.paymentMethod !== "EFECTIVO";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Detalle del abono</p>
        <p className="text-xs text-muted-foreground">
          Suma: {formatMoney(Number(installment.amount || 0), currency)}
        </p>
        {errors && errors.length > 0 ? <p className="text-xs text-destructive">{errors.join(" Â· ")}</p> : null}
      </div>

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
        <select
          id={methodId}
          required
          value={installment.paymentMethod}
          onChange={(event) => onPaymentMethodChange(event.target.value as PaymentMethod | "")}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Seleccionar metodo</option>
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={receiptId} className="text-xs font-medium text-foreground">
          Comprobante de pago del abono
        </label>
        <Input
          id={receiptId}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          required={requiresReceipt}
          className="cursor-pointer"
          onChange={(event) => onReceiptChange(event.currentTarget.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          {installment.paymentMethod === "EFECTIVO"
            ? "Opcional para efectivo."
            : "Requerido para tarjeta, transferencia u otros medios."}
        </p>
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
          <input type="hidden" name="paymentReceiptMethods" value={installment.paymentMethod} />
          <input type="hidden" name="paymentReceiptNotes" value={installment.note} />
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
  onPaymentMethodChange,
  onReceiptChange,
  onNoteChange,
  onDiscountAmountChange,
  onSubmit,
}: {
  open: boolean;
  quote: QuoteRow | null;
  currency: SupportedCurrencyCode;
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
  onPaymentMethodChange: (id: string, value: PaymentMethod | "") => void;
  onReceiptChange: (id: string, file: File | null) => void;
  onNoteChange: (id: string, value: string) => void;
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
                        <p className="text-xs text-muted-foreground">Capital bruto</p>
                        <p className="font-semibold text-foreground">{formatMoney(quote ? quote.total : 0, currency)}</p>
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
                        <p className="text-xs text-muted-foreground">Capital neto</p>
                        <p className="font-semibold text-foreground">{formatMoney(validation.capitalTotal, currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Abonos</p>
                        <p className="font-semibold text-foreground">{formatMoney(validation.totalInstallments, currency)}</p>
                      </div>
                      <div className="sm:col-span-2">
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
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-sm font-semibold text-foreground">Detalle de abonos</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cada bloque se guarda de forma independiente. El total de abonos debe coincidir con lo registrado abajo.
                    </p>
                  </div>

                  {selectedInstallment ? (
                    <SaleInstallmentEditor
                      installment={selectedInstallment}
                      currency={currency}
                      onAmountChange={(value) => onAttachmentAmountChange(selectedInstallment.id, value)}
                      onPaymentMethodChange={(value) => onPaymentMethodChange(selectedInstallment.id, value)}
                      onReceiptChange={(file) => onReceiptChange(selectedInstallment.id, file)}
                      onNoteChange={(value) => onNoteChange(selectedInstallment.id, value)}
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

export function QuotesDataTable({ quotes, currency }: QuotesDataTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("cotizacion");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; code: string } | null>(null);
  const [pendingSale, setPendingSale] = React.useState<QuoteRow | null>(null);
  const [discountAmount, setDiscountAmount] = React.useState("0");
  const [saleAttachments, setSaleAttachments] = React.useState<SaleAttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = React.useState("");
  const [selectedAttachmentId, setSelectedAttachmentId] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
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

  const sortedQuotes = React.useMemo(() => {
    const list = [...quotes];
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
  }, [quotes, sortDirection, sortKey]);

  const saleValidation = React.useMemo(() => {
    return validateSaleInstallments({
      quoteTotal: pendingSale?.total ?? 0,
      discountAmount,
      installments: saleAttachments,
    });
  }, [discountAmount, pendingSale?.total, saleAttachments]);

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
    setIsDragging(false);
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
          amount: quote.total.toFixed(2),
          file: null,
          previewUrl: null,
          paymentMethod: "",
          note: "",
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
      paymentMethod: "",
      note: "",
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

  const updateAttachmentPaymentMethod = React.useCallback((attachmentId: string, value: PaymentMethod | "") => {
    setSaleAttachments((current) => current.map((item) => (item.id === attachmentId ? { ...item, paymentMethod: value } : item)));
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
                  Aun no hay cotizaciones.
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
            Aun no hay cotizaciones.
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
        onPaymentMethodChange={updateAttachmentPaymentMethod}
        onReceiptChange={updateAttachmentFile}
        onNoteChange={updateAttachmentNote}
        onDiscountAmountChange={setDiscountAmount}
        onSubmit={handleSaleSubmit}
      />
    </div>
  );
}

