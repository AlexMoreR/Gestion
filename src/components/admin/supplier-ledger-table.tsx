"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart3, ClipboardPlus, Eye, Plus, Trash2, X } from "lucide-react";
import { adminDeleteSupplierPaymentAction } from "@/app/actions/supplier-ledger-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ReceiptLightbox } from "@/components/ui/receipt-lightbox";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import { InventoryDataGrid } from "@/modules/inventory/presentation/components/inventory-data-grid";

// Fecha local (YYYY-MM-DD) a partir del ISO, para comparar con los <input type="date">.
function localDay(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function isImage(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(url.split("?")[0] ?? "");
}

function fmtLocal(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

// Primer y ultimo dia del mes actual (YYYY-MM-DD).
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: fmtLocal(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: fmtLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export type SupplierLedgerRow = {
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

type SupplierLedgerTableProps = {
  ledger: SupplierLedgerRow[];
  currency: SupportedCurrencyCode;
  returnTo: string;
  // Token para "Balance" (link público) y callbacks de registro.
  balanceToken?: string | null;
  onRegisterMovement?: () => void;
  onRegisterManual?: () => void;
};

export function SupplierLedgerTable({
  ledger,
  currency,
  returnTo,
  balanceToken = null,
  onRegisterMovement,
  onRegisterManual,
}: SupplierLedgerTableProps) {
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [viewerUrl, setViewerUrl] = React.useState<string | null>(null);
  // Orden seleccionada para ver todos sus movimientos en un modal.
  const [detailOrder, setDetailOrder] = React.useState<string | null>(null);

  // Todos los movimientos de la orden seleccionada (sin filtro de fecha).
  const detailEntries = React.useMemo(
    () =>
      detailOrder
        ? [...ledger]
            .filter((entry) => entry.orderCode === detailOrder)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [],
    [ledger, detailOrder],
  );

  // Por defecto muestra el mes actual. Se fija en el cliente para evitar
  // desajustes de hidratacion por zona horaria.
  React.useEffect(() => {
    const { from, to } = currentMonthRange();
    setFromDate(from);
    setToDate(to);
  }, []);

  // Ordena por fecha de mayor a menor (mas reciente primero).
  const sortedLedger = [...ledger].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Al buscar se ignora el filtro de fecha para poder encontrar cualquier
  // movimiento (p. ej. una orden de otro mes); sin busqueda, se filtra por rango.
  const gridData = search.trim()
    ? sortedLedger
    : sortedLedger.filter((entry) => {
        const day = localDay(entry.createdAt);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        return true;
      });

  const dateFilter = (
    <div className="flex items-center gap-1.5">
      <DateRangePicker
        from={fromDate}
        to={toDate}
        onChange={(range) => {
          setFromDate(range.from);
          setToDate(range.to);
        }}
        aria-label="Rango de fechas"
        className="sm:w-64"
        placeholder="Rango de fechas"
      />
      {fromDate || toDate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setFromDate("");
            setToDate("");
          }}
          aria-label="Limpiar fechas"
          title="Limpiar fechas"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}

      {/* Menú de acciones a la derecha del buscador. */}
      {balanceToken || onRegisterMovement || onRegisterManual ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Acciones">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {balanceToken ? (
              <DropdownMenuItem asChild>
                <a href={`/proveedores/${balanceToken}`} target="_blank" rel="noopener noreferrer">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Balance
                </a>
              </DropdownMenuItem>
            ) : null}
            {onRegisterMovement ? (
              <DropdownMenuItem onClick={onRegisterMovement}>
                <Plus className="mr-2 h-4 w-4" />
                Registrar movimiento
              </DropdownMenuItem>
            ) : null}
            {onRegisterManual ? (
              <DropdownMenuItem onClick={onRegisterManual}>
                <ClipboardPlus className="mr-2 h-4 w-4" />
                Registro manual
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );

  const columns: ColumnDef<SupplierLedgerRow, unknown>[] = [
    {
      accessorKey: "createdAt",
      header: "Fecha",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("es-CO")}
        </span>
      ),
    },
    {
      id: "type",
      // Incluye el codigo de orden/cargo en el valor para que el buscador lo
      // encuentre (los abonos no lo muestran en el detalle).
      accessorFn: (row) => `${row.type === "CHARGE" ? "Cargo" : "Abono"} ${row.orderCode ?? row.code ?? ""}`,
      header: "Tipo",
      cell: ({ row }) => {
        const entry = row.original;
        const reference = entry.orderCode ?? entry.code;
        return (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                entry.type === "CHARGE"
                  ? "border-destructive/30 bg-destructive/15 text-destructive"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              }
            >
              {entry.type === "CHARGE" ? "Cargo" : "Abono"}
            </Badge>
            {reference ? <span className="text-xs text-muted-foreground">{reference}</span> : null}
          </div>
        );
      },
    },
    {
      accessorKey: "note",
      header: "Detalle",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.note ?? "-"}</span>,
    },
    {
      id: "createdBy",
      header: "Registrado por",
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              {entry.createdByImage ? (
                <AvatarImage src={entry.createdByImage} alt={entry.createdByName ?? "Usuario"} />
              ) : null}
              <AvatarFallback className="text-[9px]">
                {(entry.createdByName ?? "S").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {entry.createdByName ?? "Sistema"}
              {entry.accountName ? ` - ${entry.accountName}` : ""}
            </span>
            {entry.receiptUrl ? (
              isImage(entry.receiptUrl) ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setViewerUrl(entry.receiptUrl);
                  }}
                  title="Ver comprobante"
                  aria-label="Ver comprobante"
                  className="inline-flex items-center text-primary transition hover:text-primary/80"
                >
                  <Eye className="size-4" />
                </button>
              ) : (
                <a
                  href={entry.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  title="Ver comprobante"
                  className="inline-flex items-center text-primary transition hover:text-primary/80"
                >
                  <Eye className="size-4" />
                </a>
              )
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "amount",
      header: "Monto",
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <span
            className={`text-sm font-semibold ${entry.type === "CHARGE" ? "text-red-600" : "text-emerald-600"}`}
          >
            {entry.type === "CHARGE" ? "+" : "-"}
            {formatMoney(entry.amount, currency)}
          </span>
        );
      },
    },
    {
      id: "acciones",
      header: "",
      cell: ({ row }) => {
        const entry = row.original;
        // Los cargos atados a una orden no se eliminan desde aqui.
        if (!(entry.type === "PAYMENT" || !entry.orderCode)) {
          return null;
        }
        return (
          <form
            action={adminDeleteSupplierPaymentAction}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              if (!window.confirm(entry.type === "CHARGE" ? "¿Eliminar este cargo?" : "¿Eliminar este abono?")) {
                event.preventDefault();
              }
            }}
            className="flex justify-end"
          >
            <input type="hidden" name="paymentId" value={entry.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={entry.type === "CHARGE" ? "Eliminar cargo" : "Eliminar abono"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </form>
        );
      },
    },
  ];

  return (
    <>
      <InventoryDataGrid
        title="Movimientos"
        description="Cargos y abonos de la cuenta del proveedor."
        data={gridData}
        columns={columns}
        searchPlaceholder="Buscar movimiento"
        emptyMessage="Sin movimientos registrados."
        pageSize={12}
        toolbar={dateFilter}
        searchFirst
        onSearchChange={setSearch}
        onRowClick={(row) => {
          // Solo los movimientos ligados a una orden abren el detalle.
          if (row.orderCode) setDetailOrder(row.orderCode);
        }}
      />
      <ReceiptLightbox url={viewerUrl} onClose={() => setViewerUrl(null)} />
      <OrderMovementsModal
        orderCode={detailOrder}
        entries={detailEntries}
        currency={currency}
        onClose={() => setDetailOrder(null)}
        onViewReceipt={(url) => setViewerUrl(url)}
      />
    </>
  );
}

// Modal con todos los movimientos (cargos/abonos) de una misma orden.
function OrderMovementsModal({
  orderCode,
  entries,
  currency,
  onClose,
  onViewReceipt,
}: {
  orderCode: string | null;
  entries: SupplierLedgerRow[];
  currency: SupportedCurrencyCode;
  onClose: () => void;
  onViewReceipt: (url: string) => void;
}) {
  React.useEffect(() => {
    if (!orderCode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderCode, onClose]);

  if (!orderCode) return null;

  const chargesTotal = entries
    .filter((entry) => entry.type === "CHARGE")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const paymentsTotal = entries
    .filter((entry) => entry.type === "PAYMENT")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const balance = chargesTotal - paymentsTotal;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Movimientos de la orden ${orderCode}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Movimientos de la orden</p>
            <p className="text-xs text-muted-foreground">{orderCode} · {entries.length} movimiento{entries.length === 1 ? "" : "s"}</p>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {entries.map((entry) => {
            const receiptUrl = entry.receiptUrl;
            return (
              <div
                key={entry.id}
                className={`rounded-xl border border-border bg-background p-3 ${
                  receiptUrl ? "cursor-pointer transition hover:border-primary/40 hover:bg-muted/40" : ""
                }`}
                role={receiptUrl ? "button" : undefined}
                onClick={receiptUrl ? () => onViewReceipt(receiptUrl) : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <Badge
                      variant="outline"
                      className={
                        entry.type === "CHARGE"
                          ? "border-destructive/30 bg-destructive/15 text-destructive"
                          : "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {entry.type === "CHARGE" ? "Cargo" : "Abono"}
                    </Badge>
                    <p className="truncate text-sm text-foreground">{entry.note ?? "-"}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">
                        {new Date(entry.createdAt).toLocaleDateString("es-CO")}
                        {entry.createdByName ? ` · ${entry.createdByName}` : ""}
                        {entry.accountName ? ` · ${entry.accountName}` : ""}
                      </span>
                      {receiptUrl ? (
                        <Eye className="h-4 w-4 shrink-0 text-primary" aria-label="Ver comprobante" />
                      ) : null}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold ${entry.type === "CHARGE" ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {entry.type === "CHARGE" ? "+" : "-"}
                    {formatMoney(entry.amount, currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border bg-muted/30 px-4 py-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cargos</p>
            <p className="text-sm font-semibold text-red-600">{formatMoney(chargesTotal, currency)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Abonos</p>
            <p className="text-sm font-semibold text-emerald-600">{formatMoney(paymentsTotal, currency)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo</p>
            <p className="text-sm font-bold text-foreground">{formatMoney(balance, currency)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
