"use client";

import Link from "next/link";
import * as React from "react";
import {
  BadgeDollarSign,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  CalendarDays,
  Download,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  ReceiptText,
  User2,
  Eye,
  FileCheck2,
} from "lucide-react";
import { adminCreateOrderFromSaleAction } from "@/app/actions/orders-actions";
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

type SaleStatus = "DRAFT" | "ACTIVE" | "INVOICED" | "COMPLETED" | "CANCELLED";

type SalePaymentRow = {
  amount: number;
  paymentMethod: string;
  note: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
  receiptType: string | null;
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
  invoiceToken: string;
  paymentReceiptUrl: string;
  paymentReceiptType: string;
  salePayments: SalePaymentRow[];
  hasOrder: boolean;
};

type SalesDataTableProps = {
  sales: SaleRow[];
  currency: SupportedCurrencyCode;
};

type SortKey = "sale" | "quote" | "client" | "status" | "total" | "downPayment" | "remaining" | "created";
type SortDirection = "asc" | "desc";

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
  sale,
  currency,
  onViewReceipts,
}: {
  sale: SaleRow;
  currency: SupportedCurrencyCode;
  onViewReceipts: () => void;
}) {
  const hasReceipts =
    sale.salePayments.length > 0 ||
    Boolean(sale.paymentReceiptUrl);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones ${sale.code}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/sales/${sale.invoiceToken}`}>
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Ver factura
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={`/api/generate-sale-invoice-pdf?token=${sale.invoiceToken}`}
            download={`invoice-${sale.invoiceToken}.pdf`}
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
              amount: sale.downPaymentAmount,
              paymentMethod: "N/A",
              note: null,
              receiptUrl: sale.paymentReceiptUrl,
              receiptName: "Comprobante principal",
              receiptType: sale.paymentReceiptType,
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

export function SalesDataTable({ sales, currency }: SalesDataTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("created");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [selectedSale, setSelectedSale] = React.useState<SaleRow | null>(null);

  const sortedSales = React.useMemo(() => {
    const list = [...sales];
    const directionFactor = sortDirection === "asc" ? 1 : -1;
    const textCompare = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });

    list.sort((a, b) => {
      switch (sortKey) {
        case "sale":
          return textCompare(a.code, b.code) * directionFactor;
        case "quote":
          return textCompare(a.quoteCode, b.quoteCode) * directionFactor;
        case "client":
          return textCompare(a.clientName, b.clientName) * directionFactor;
        case "status":
          return textCompare(statusLabel(a.status), statusLabel(b.status)) * directionFactor;
        case "total":
          return (a.total - b.total) * directionFactor;
        case "downPayment":
          return (a.downPaymentAmount - b.downPaymentAmount) * directionFactor;
        case "remaining":
          return (a.remainingBalance - b.remainingBalance) * directionFactor;
        case "created":
          return textCompare(a.createdAt, b.createdAt) * directionFactor;
        default:
          return 0;
      }
    });

    return list;
  }, [sales, sortDirection, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

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

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "sale"}
                  direction={sortDirection}
                  onClick={() => toggleSort("sale")}
                  icon={<FileText className="h-3.5 w-3.5" />}
                >
                  Venta
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "quote"}
                  direction={sortDirection}
                  onClick={() => toggleSort("quote")}
                  icon={<FileText className="h-3.5 w-3.5" />}
                >
                  Cotizacion
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "client"}
                  direction={sortDirection}
                  onClick={() => toggleSort("client")}
                  icon={<User2 className="h-3.5 w-3.5" />}
                >
                  Cliente
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "status"}
                  direction={sortDirection}
                  onClick={() => toggleSort("status")}
                  icon={<ReceiptText className="h-3.5 w-3.5" />}
                >
                  Estado
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "total"}
                  direction={sortDirection}
                  onClick={() => toggleSort("total")}
                  icon={<FileText className="h-3.5 w-3.5" />}
                >
                  Total
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "downPayment"}
                  direction={sortDirection}
                  onClick={() => toggleSort("downPayment")}
                  icon={<ReceiptText className="h-3.5 w-3.5" />}
                >
                  Abono
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "remaining"}
                  direction={sortDirection}
                  onClick={() => toggleSort("remaining")}
                  icon={<BadgeDollarSign className="h-3.5 w-3.5" />}
                >
                  Restante
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "created"}
                  direction={sortDirection}
                  onClick={() => toggleSort("created")}
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                >
                  Fecha
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-9 text-center text-muted-foreground">
                  Aun no hay ventas.
                </TableCell>
              </TableRow>
            ) : (
              sortedSales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    <p className="text-sm font-semibold text-foreground">{sale.code}</p>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{sale.quoteCode}</TableCell>
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
                  <TableCell className="text-sm font-semibold text-foreground">
                    {formatMoney(sale.remainingBalance, currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{sale.createdAt}</TableCell>
                  <TableCell>
                    <form data-create-order-sale-id={sale.id} action={adminCreateOrderFromSaleAction}>
                      <input type="hidden" name="returnTo" value="/admin/ventas" />
                      <input type="hidden" name="saleId" value={sale.id} />
                    </form>
                    <div className="flex items-center">
                      <RowActions sale={sale} currency={currency} onViewReceipts={() => setSelectedSale(sale)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 md:hidden">
        {sortedSales.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
            Aun no hay ventas.
          </div>
        ) : (
          sortedSales.map((sale) => (
            <article key={sale.id} className="space-y-2.5 rounded-xl border border-border bg-card p-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{sale.code}</p>
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(sale.status)}`}>
                    {statusLabel(sale.status)}
                  </span>
                </div>
                <p className="text-sm text-foreground">{sale.quoteCode}</p>
                <p className="text-sm text-foreground">{sale.clientName}</p>
                <p className="text-xs text-muted-foreground">{sale.createdAt}</p>
                <p className="text-sm font-semibold text-foreground">{formatMoney(sale.total, currency)}</p>
                <p className="text-xs text-muted-foreground">
                  Abono: {formatMoney(sale.downPaymentAmount, currency)} · Restante:{" "}
                  {formatMoney(sale.remainingBalance, currency)}
                </p>
                <p className="text-xs text-muted-foreground">{getReceiptLabel(sale.paymentReceiptType)}</p>
              </div>
              <div className="flex items-center justify-end">
                <form data-create-order-sale-id={sale.id} action={adminCreateOrderFromSaleAction}>
                  <input type="hidden" name="returnTo" value="/admin/ventas" />
                  <input type="hidden" name="saleId" value={sale.id} />
                </form>
                <RowActions sale={sale} currency={currency} onViewReceipts={() => setSelectedSale(sale)} />
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
