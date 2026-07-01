"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { adminUpdateOrderHistoryDateAction } from "@/app/actions/order-item-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReceiptLightbox } from "@/components/ui/receipt-lightbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type HistoryEntry = {
  id: string;
  fromLabel: string;
  toLabel: string;
  date: string;
  // Fecha en formato yyyy-MM-dd para el input al editar.
  dateValue: string;
  by: string;
  note: string | null;
};

type PaymentEntry = {
  id: string;
  amount: number;
  method: string | null;
  note: string | null;
  paidAt: string | null;
  receiptUrl: string | null;
};

type OrderHistoryTabsProps = {
  history: HistoryEntry[];
  payments: PaymentEntry[];
  currency: SupportedCurrencyCode;
  orderId: string;
  returnTo: string;
};

export function OrderHistoryTabs({ history, payments, currency, orderId, returnTo }: OrderHistoryTabsProps) {
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const [editing, setEditing] = React.useState<HistoryEntry | null>(null);
  const [receiptUrl, setReceiptUrl] = React.useState<string | null>(null);

  return (
    <Tabs defaultValue="historial">
      <TabsList>
        <TabsTrigger value="historial">Historial</TabsTrigger>
        <TabsTrigger value="abonos">Abonos</TabsTrigger>
      </TabsList>

      <TabsContent value="historial" className="space-y-2 pt-1">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
        ) : (
          history.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setEditing(item)}
              className="group w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-ring hover:bg-muted/40"
              title="Editar fecha del movimiento"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {item.fromLabel} <span className="text-muted-foreground">-&gt;</span> {item.toLabel}
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {item.date}
                  <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="rounded-md text-[10px]">{getInitials(item.by)}</AvatarFallback>
                </Avatar>
                <p className="text-xs text-muted-foreground">
                  {item.by}
                  {item.note ? ` - ${item.note}` : ""}
                </p>
              </div>
            </button>
          ))
        )}
      </TabsContent>

      <TabsContent value="abonos" className="space-y-2 pt-1">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin abonos registrados.</p>
        ) : (
          <>
            {payments.map((payment, index) => (
              <div key={payment.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    Abono {index + 1} - {formatMoney(payment.amount, currency)}
                  </p>
                  {payment.paidAt ? (
                    <p className="text-xs text-muted-foreground">{payment.paidAt}</p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {payment.method || "Sin método"}
                  {payment.note ? ` - ${payment.note}` : ""}
                </p>
                {payment.receiptUrl ? (
                  <button
                    type="button"
                    onClick={() => setReceiptUrl(payment.receiptUrl)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver comprobante
                  </button>
                ) : null}
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Total abonado</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(totalPaid, currency)}</p>
            </div>
          </>
        )}
      </TabsContent>

      <Dialog open={Boolean(editing)} onOpenChange={(value) => (value ? null : setEditing(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar fecha del movimiento</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form action={adminUpdateOrderHistoryDateAction} className="space-y-3">
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="historyId" value={editing.id} />

              <p className="text-sm text-muted-foreground">
                {editing.fromLabel} <span className="text-muted-foreground">-&gt;</span> {editing.toLabel}
              </p>

              <div className="space-y-1.5">
                <label htmlFor="history-date" className="text-sm font-medium text-foreground">
                  Fecha
                </label>
                <input
                  id="history-date"
                  name="date"
                  type="date"
                  defaultValue={editing.dateValue}
                  required
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </div>

              <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                <input type="checkbox" name="updateSupplierCharges" className="mt-0.5" />
                <span>
                  También cambiar la fecha de los cargos a proveedores
                  <span className="block text-xs text-muted-foreground">
                    Alinea a esta fecha los cargos y pagos a proveedores generados por esta orden.
                  </span>
                </span>
              </label>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReceiptLightbox url={receiptUrl} onClose={() => setReceiptUrl(null)} />
    </Tabs>
  );
}
