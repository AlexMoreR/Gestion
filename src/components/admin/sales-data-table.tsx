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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

type SaleStatus = "DRAFT" | "ACTIVE" | "INVOICED" | "COMPLETED" | "CANCELLED";

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

function RowActions({ sale }: { sale: SaleRow }) {
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
        {sale.paymentReceiptUrl ? (
          <DropdownMenuItem asChild>
            <a href={sale.paymentReceiptUrl} target="_blank" rel="noreferrer">
              {sale.paymentReceiptType.startsWith("image/") ? (
                <ImageIcon className="mr-2 h-4 w-4" />
              ) : (
                <ReceiptText className="mr-2 h-4 w-4" />
              )}
              Ver comprobante
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <ReceiptText className="mr-2 h-4 w-4" />
            Sin comprobante
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SalesDataTable({ sales, currency }: SalesDataTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("created");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

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
                      <RowActions sale={sale} />
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
                <RowActions sale={sale} />
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
