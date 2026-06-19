"use client";

import Link from "next/link";
import * as React from "react";
import {
  ArrowUpRight,
  Download,
  FileText,
  ImagePlus,
  MoreHorizontal,
  PlusCircle,
  Eye,
  FileCheck2,
  Trash2,
  X,
} from "lucide-react";
import { useFormStatus } from "react-dom";
import {
  adminAddSalePaymentAction,
  adminDeleteSalePaymentAction,
  adminDeleteSaleAction,
} from "@/app/actions/sales-actions";
import { adminCreateOrderFromSaleAction } from "@/app/actions/orders-actions";
import { invoicePdfFileName } from "@/lib/document-names";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { MoneyInput } from "@/components/ui/money-input";

type SaleStatus = "DRAFT" | "ACTIVE" | "INVOICED" | "COMPLETED" | "CANCELLED";

type AccountType = "CASH" | "BANK" | "WALLET" | "OTHER";

type AccountOption = {
  id: string;
  name: string;
  type: AccountType;
};

type SalePaymentRow = {
  id: string;
  amount: number;
  paymentMethod: string;
  note: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
  receiptType: string | null;
  paidAt: string | null;
};

type SaleRow = {
  id: string;
  code: string;
  quoteCode: string;
  clientName: string;
  total: number;
  downPaymentAmount: number;
  remainingBalance: number;
  status: SaleStatus;
  createdAt: string;
  createdAtISO: string;
  invoiceToken: string;
  paymentReceiptUrl: string;
  paymentReceiptType: string;
  salePayments: SalePaymentRow[];
  hasOrder: boolean;
};

type SalesDataTableProps = {
  sales: SaleRow[];
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
};

function statusLabel(status: SaleStatus): string {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "ACTIVE":
      return "Activa";
    case "INVOICED":
      return "Facturada";
    case "COMPLETED":
      return "Finalizada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

function statusBadgeClassName(status: SaleStatus): string {
  switch (status) {
    case "DRAFT":
      return "border-border bg-muted text-muted-foreground";
    case "ACTIVE":
      return "border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "INVOICED":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "COMPLETED":
      return "border-primary/30 bg-primary/15 text-primary";
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function getReceiptLabel(receiptType: string): string {
  if (receiptType.startsWith("image/")) {
    return "Imagen del comprobante";
  }

  if (receiptType === "application/pdf") {
    return "Comprobante PDF";
  }

  return "Comprobante";
}

function getPaymentMethodLabel(paymentMethod: string): string {
  switch (paymentMethod) {
    case "EFECTIVO":
      return "Efectivo";
    case "TARJETA":
      return "Tarjeta";
    case "TRANSFERENCIA":
      return "Transferencia";
    case "OTRO":
      return "Otro";
    default:
      return paymentMethod || "N/A";
  }
}

function getAccountTypeLabel(type: AccountType): string {
  switch (type) {
    case "CASH":
      return "Efectivo";
    case "BANK":
      return "Banco";
    case "WALLET":
      return "Billetera";
    case "OTHER":
      return "Otro";
    default:
      return type;
  }
}

function RowActions({
  sale,
  onViewReceipts,
  onAddPayment,
}: {
  sale: SaleRow;
  onViewReceipts: () => void;
  onAddPayment: () => void;
}) {
  const hasReceipts =
    sale.salePayments.length > 0 ||
    Boolean(sale.paymentReceiptUrl);
  const canAddPayment = sale.status !== "CANCELLED" && sale.remainingBalance > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones ${sale.code}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onAddPayment} disabled={!canAddPayment}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {canAddPayment ? "Registrar abono" : "Venta saldada"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/sales/${sale.invoiceToken}`}>
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Ver factura
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={`/api/generate-sale-invoice-pdf?token=${sale.invoiceToken}`}
            download={invoicePdfFileName(sale.code)}
            target="_blank"
            rel="noreferrer"
          >
            <Download className="mr-2 h-4 w-4" />
            Descargar PDF
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const form = document.querySelector<HTMLFormElement>(`form[data-create-order-sale-id="${sale.id}"]`);
            form?.requestSubmit();
          }}
          disabled={sale.hasOrder}
        >
          <FileText className="mr-2 h-4 w-4" />
          {sale.hasOrder ? "Orden creada" : "Crear orden"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onViewReceipts} disabled={!hasReceipts}>
          <Eye className="mr-2 h-4 w-4" />
          {hasReceipts ? "Ver comprobantes" : "Sin comprobantes"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
          onClick={() => {
            const confirmed = window.confirm(
              `¿Eliminar la venta ${sale.code}?\n\nSe borrarán también la orden, despachos, producción, abonos y los pagos/cargos a proveedores ligados. Esta acción no se puede deshacer.`,
            );
            if (!confirmed) return;
            const form = document.querySelector<HTMLFormElement>(
              `form[data-delete-sale-id="${sale.id}"]`,
            );
            form?.requestSubmit();
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar venta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SaleReceiptsSheet({
  sale,
  currency,
  open,
  onOpenChange,
}: {
  sale: SaleRow | null;
  currency: SupportedCurrencyCode;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const receipts = sale
    ? sale.salePayments.length > 0
      ? sale.salePayments
      : sale.paymentReceiptUrl
        ? [
            {
              id: "",
              amount: sale.downPaymentAmount,
              paymentMethod: "N/A",
              note: null,
              receiptUrl: sale.paymentReceiptUrl,
              receiptName: "Comprobante principal",
              receiptType: sale.paymentReceiptType,
              paidAt: null,
            },
          ]
        : []
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>Comprobantes de pago</SheetTitle>
          <SheetDescription>
            {sale ? `Venta ${sale.code} · ${sale.quoteCode}` : "Lista de comprobantes asociados a la venta."}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-2">
          {sale ? (
            <>
              <div className="rounded-2xl border border-border bg-muted/20 p-3 text-sm">
                <p className="font-semibold text-foreground">{sale.clientName}</p>
                <p className="text-muted-foreground">Abonos registrados: {receipts.length}</p>
              </div>

              {receipts.length > 0 ? (
                <div className="space-y-2">
                  {receipts.map((receipt, index) => (
                    <div key={`${receipt.receiptUrl ?? index}-${index}`} className="rounded-2xl border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-foreground">Abono #{index + 1}</p>
                          <p className="text-xs text-muted-foreground">{getPaymentMethodLabel(receipt.paymentMethod)}</p>
                          {receipt.paidAt ? (
                            <p className="text-xs text-muted-foreground">{receipt.paidAt}</p>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold text-foreground">{formatMoney(receipt.amount, currency)}</p>
                      </div>
                      {receipt.note ? <p className="mt-2 text-xs text-muted-foreground">{receipt.note}</p> : null}
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">
                            {receipt.receiptName || "Sin comprobante"}
                          </p>
                          {receipt.receiptType ? (
                            <p className="text-xs text-muted-foreground">{getReceiptLabel(receipt.receiptType)}</p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {receipt.receiptUrl ? (
                            <a
                              href={receipt.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                            >
                              <FileCheck2 className="h-3.5 w-3.5" />
                              Abrir
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin archivo</span>
                          )}
                          {receipt.id ? (
                            <form action={adminDeleteSalePaymentAction}>
                              <input type="hidden" name="returnTo" value="/admin/ventas" />
                              <input type="hidden" name="paymentId" value={receipt.id} />
                              <DeletePaymentButton />
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                  Esta venta todavía no tiene comprobantes asociados.
                </div>
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SavePaymentButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      <PlusCircle className="h-4 w-4" />
      {pending ? "Guardando..." : "Guardar abono"}
    </Button>
  );
}

function DeletePaymentButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      aria-label="Eliminar abono"
      title="Eliminar abono"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function ReceiptUploadField() {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = React.useState<
    { url: string | null; name: string; isImage: boolean } | null
  >(null);

  React.useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      if (!file) return null;
      const isImage = file.type.startsWith("image/");
      return { url: isImage ? URL.createObjectURL(file) : null, name: file.name, isImage };
    });
  };

  const clear = () => {
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">Comprobante</p>
      <div className="flex flex-wrap items-center gap-2">
        {preview ? (
          <span className="relative inline-block">
            {preview.isImage && preview.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={preview.name}
                className="h-16 w-16 rounded-md border border-border object-cover"
              />
            ) : (
              <span className="flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-md border border-border px-2 text-center">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="w-full truncate text-[10px] text-muted-foreground">{preview.name}</span>
              </span>
            )}
            <button
              type="button"
              onClick={clear}
              className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-red-600 text-white shadow-sm transition hover:bg-red-700"
              aria-label="Quitar comprobante"
              title="Quitar comprobante"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition hover:border-ring hover:text-foreground"
          title="Subir comprobante"
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-[10px] font-medium">Archivo</span>
        </button>
        <input
          ref={inputRef}
          id="add-payment-receipt"
          name="receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

function AddSalePaymentSheet({
  sale,
  currency,
  accounts,
  open,
  onOpenChange,
}: {
  sale: SaleRow | null;
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
  const today = new Date();
  const todayValue = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const [amount, setAmount] = React.useState("");

  React.useEffect(() => {
    if (!open) setAmount("");
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <SheetTitle className="shrink-0">Registrar abono</SheetTitle>
            {sale ? (
              <input
                id="add-payment-date"
                form="add-payment-form"
                name="paymentDate"
                type="date"
                required
                defaultValue={todayValue}
                aria-label="Fecha del abono"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            ) : null}
          </div>
          <SheetDescription>
            {sale ? `Venta ${sale.code} · ${sale.clientName}` : "Registra un nuevo abono para la venta."}
          </SheetDescription>
        </SheetHeader>

        {sale ? (
          <form
            id="add-payment-form"
            action={adminAddSalePaymentAction}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-3"
          >
            <input type="hidden" name="returnTo" value="/admin/ventas" />
            <input type="hidden" name="saleId" value={sale.id} />

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total venta</p>
                <p className="font-semibold text-foreground">{formatMoney(sale.total, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                <p className="font-semibold text-foreground">{formatMoney(sale.remainingBalance, currency)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="add-payment-amount" className="text-sm font-medium text-foreground">
                Monto del abono
              </label>
              <MoneyInput
                id="add-payment-amount"
                name="amount"
                value={amount}
                onValueChange={setAmount}
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground">
                Maximo {formatMoney(sale.remainingBalance, currency)}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="add-payment-account" className="text-sm font-medium text-foreground">
                Cuenta de balance
              </label>
              <select
                id="add-payment-account"
                name="accountId"
                required
                defaultValue={accounts[0]?.id ?? ""}
                disabled={accounts.length === 0}
                className={inputClass}
              >
                {accounts.length === 0 ? (
                  <option value="">Sin cuentas activas</option>
                ) : (
                  accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} - {getAccountTypeLabel(account.type)}
                    </option>
                  ))
                )}
              </select>
              {accounts.length === 0 ? (
                <p className="text-xs text-destructive">
                  Crea una cuenta activa en Balances para registrar abonos.
                </p>
              ) : null}
            </div>

            <ReceiptUploadField />

            <div className="space-y-1.5">
              <label htmlFor="add-payment-note" className="text-sm font-medium text-foreground">
                Nota (opcional)
              </label>
              <textarea
                id="add-payment-note"
                name="note"
                rows={2}
                className={inputClass}
                placeholder="Observaciones del abono"
              />
            </div>

            <SavePaymentButton disabled={accounts.length === 0} />
          </form>
        ) : null}

        {sale && sale.salePayments.length > 0 ? (
          <div className="space-y-2 border-t border-border px-4 pb-6 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Abonos registrados
            </p>
            <div className="space-y-2">
              {sale.salePayments.map((payment, index) => (
                <div
                  key={payment.id || index}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {formatMoney(payment.amount, currency)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {getPaymentMethodLabel(payment.paymentMethod)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {payment.paidAt || "Sin fecha"}
                      {payment.note ? ` · ${payment.note}` : ""}
                    </p>
                  </div>
                  {payment.id ? (
                    <form action={adminDeleteSalePaymentAction}>
                      <input type="hidden" name="returnTo" value="/admin/ventas" />
                      <input type="hidden" name="paymentId" value={payment.id} />
                      <DeletePaymentButton />
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function SalesDataTable({ sales, currency, accounts }: SalesDataTableProps) {
  const [selectedSale, setSelectedSale] = React.useState<SaleRow | null>(null);
  const [paymentSale, setPaymentSale] = React.useState<SaleRow | null>(null);

  return (
    <div className="space-y-3">
      <SaleReceiptsSheet
        sale={selectedSale}
        currency={currency}
        open={Boolean(selectedSale)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSale(null);
          }
        }}
      />

      <AddSalePaymentSheet
        sale={paymentSale}
        currency={currency}
        accounts={accounts}
        open={Boolean(paymentSale)}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentSale(null);
          }
        }}
      />

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Venta</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Abono</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="sr-only">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-9 text-center text-muted-foreground">
                  No hay ventas con los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    <p className="text-sm font-semibold text-foreground">{sale.code}</p>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{sale.clientName}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(sale.status)}`}>
                      {statusLabel(sale.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">
                    {formatMoney(sale.total, currency)}
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">
                    {formatMoney(sale.downPaymentAmount, currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{sale.createdAt}</TableCell>
                  <TableCell>
                    <form data-create-order-sale-id={sale.id} action={adminCreateOrderFromSaleAction}>
                      <input type="hidden" name="returnTo" value="/admin/ventas" />
                      <input type="hidden" name="saleId" value={sale.id} />
                    </form>
                    <form data-delete-sale-id={sale.id} action={adminDeleteSaleAction}>
                      <input type="hidden" name="returnTo" value="/admin/ventas" />
                      <input type="hidden" name="saleId" value={sale.id} />
                    </form>
                    <div className="flex items-center">
                      <RowActions
                        sale={sale}
                        onViewReceipts={() => setSelectedSale(sale)}
                        onAddPayment={() => setPaymentSale(sale)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {sales.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            No hay ventas con los filtros seleccionados.
          </div>
        ) : (
          sales.map((sale) => (
            <article key={sale.id} className="space-y-2.5 rounded-xl border border-border bg-card p-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{sale.code}</p>
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(sale.status)}`}>
                    {statusLabel(sale.status)}
                  </span>
                </div>
                <p className="text-sm text-foreground">{sale.clientName}</p>
                <p className="text-xs text-muted-foreground">{sale.createdAt}</p>
                <p className="text-sm font-semibold text-foreground">{formatMoney(sale.total, currency)}</p>
                <p className="text-xs text-muted-foreground">
                  Abono: {formatMoney(sale.downPaymentAmount, currency)}
                </p>
                <p className="text-xs text-muted-foreground">{getReceiptLabel(sale.paymentReceiptType)}</p>
              </div>
              <div className="flex items-center justify-end">
                <form data-create-order-sale-id={sale.id} action={adminCreateOrderFromSaleAction}>
                  <input type="hidden" name="returnTo" value="/admin/ventas" />
                  <input type="hidden" name="saleId" value={sale.id} />
                </form>
                <form data-delete-sale-id={sale.id} action={adminDeleteSaleAction}>
                  <input type="hidden" name="returnTo" value="/admin/ventas" />
                  <input type="hidden" name="saleId" value={sale.id} />
                </form>
                <RowActions
                  sale={sale}
                  onViewReceipts={() => setSelectedSale(sale)}
                  onAddPayment={() => setPaymentSale(sale)}
                />
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
