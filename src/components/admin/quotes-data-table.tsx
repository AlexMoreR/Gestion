"use client";

import Link from "next/link";
import * as React from "react";
import {
  ArrowDown,
  ArrowUpRight,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Edit3,
  FileText,
  MoreHorizontal,
  ShoppingCart,
  Trash2,
  User2,
} from "lucide-react";
import { adminDeleteQuoteAction } from "@/app/actions/quote-actions";
import { adminCreateSaleFromQuoteAction } from "@/app/actions/sales-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SheetFooter,
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

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

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

type SortKey = "cotizacion" | "cliente" | "estado" | "total" | "fecha" | "acciones";
type SortDirection = "asc" | "desc";

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
    <Button
      type="button"
      variant={"ghost"}
      onClick={onClick}
      aria-label={`Ordenar por ${String(children)}`}
    >
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
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive hover:text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function QuotesDataTable({ quotes, currency }: QuotesDataTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("cotizacion");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; code: string } | null>(null);
  const [pendingSale, setPendingSale] = React.useState<QuoteRow | null>(null);

  const sortedQuotes = React.useMemo(() => {
    const list = [...quotes];
    const directionFactor = sortDirection === "asc" ? 1 : -1;
    const textCompare = (a: string, b: string) =>
      a.localeCompare(b, "es", { sensitivity: "base", numeric: true });

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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const confirmDelete = () => {
    if (!pendingDelete) {
      return;
    }
    const forms = document.querySelectorAll<HTMLFormElement>(
      `form[data-delete-quote-id="${pendingDelete.id}"]`,
    );
    const form =
      Array.from(forms).find((candidate) => candidate.offsetParent !== null) ??
      forms[0] ??
      null;
    form?.requestSubmit();
    setPendingDelete(null);
  };

  return (
    <div className="space-y-3">
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "cotizacion"}
                  direction={sortDirection}
                  onClick={() => toggleSort("cotizacion")}
                  icon={<FileText className="h-3.5 w-3.5" />}
                >
                  Cotizacion
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "cliente"}
                  direction={sortDirection}
                  onClick={() => toggleSort("cliente")}
                  icon={<User2 className="h-3.5 w-3.5" />}
                >
                  Cliente
                </HeaderLabel>
              </TableHead>
              <TableHead className="normal-case tracking-normal">
                <HeaderLabel
                  active={sortKey === "estado"}
                  direction={sortDirection}
                  onClick={() => toggleSort("estado")}
                  icon={<FileText className="h-3.5 w-3.5" />}
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
                  active={sortKey === "fecha"}
                  direction={sortDirection}
                  onClick={() => toggleSort("fecha")}
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
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(quote.status)}`}
                    >
                      {statusLabel(quote.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">
                    {formatMoney(quote.total, currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{quote.createdAt}</TableCell>
                  <TableCell>
                    <form data-delete-quote-id={quote.id} action={adminDeleteQuoteAction}>
                      <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
                      <input type="hidden" name="quoteId" value={quote.id} />
                    </form>
                    <div className="flex items-center">
                      <RowActions
                        quote={quote}
                        onDelete={() => setPendingDelete({ id: quote.id, code: quote.code })}
                        onSendToSales={() => setPendingSale(quote)}
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
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClassName(quote.status)}`}
                  >
                    {statusLabel(quote.status)}
                  </span>
                </div>
                <p className="text-sm text-foreground">{quote.clientName}</p>
                <p className="text-xs text-muted-foreground">{quote.createdAt}</p>
                <p className="text-sm font-semibold text-foreground">{formatMoney(quote.total, currency)}</p>
              </div>
              <div className="flex items-center justify-end">
                <RowActions
                  quote={quote}
                  onDelete={() => setPendingDelete({ id: quote.id, code: quote.code })}
                  onSendToSales={() => setPendingSale(quote)}
                />
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
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Eliminar cotizacion</h3>
              <p className="text-sm text-muted-foreground">
                Se eliminara <span className="font-medium text-foreground">{pendingDelete.code}</span>. Esta accion no se puede deshacer.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPendingDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={confirmDelete}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Sheet
        open={Boolean(pendingSale)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingSale(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Enviar a ventas</SheetTitle>
            <SheetDescription>
              Adjunte el recibo de pago antes de convertir {pendingSale?.code ?? "the quote"} en un registro de venta.
            </SheetDescription>
          </SheetHeader>

          <form
            action={adminCreateSaleFromQuoteAction}
            encType="multipart/form-data"
            className="flex h-full flex-col gap-5 p-4"
          >
            <input type="hidden" name="returnTo" value="/admin/cotizaciones" />
            <input type="hidden" name="quoteId" value={pendingSale?.id ?? ""} />

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="paymentReceipt">
                Comprobante de pago
              </label>
              <Input
                id="paymentReceipt"
                name="paymentReceipt"
                type="file"
                accept="image/*,application/pdf"
                required
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Archivos admitidos: imágenes o PDF. Este archivo será visible en el módulo de ventas.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{pendingSale?.code ?? "Quote"}</p>
              <p className="mt-1">
                {pendingSale?.clientName ?? "Select a quote"} will be moved to Sales once the receipt is submitted.
              </p>
            </div>

            <SheetFooter className="border-t border-border px-0 pt-4">
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPendingSale(null)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Crear venta
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
