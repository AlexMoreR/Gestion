"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
};

export function OrderHistoryTabs({ history, payments, currency }: OrderHistoryTabsProps) {
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

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
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {item.fromLabel} <span className="text-muted-foreground">-&gt;</span> {item.toLabel}
                </p>
                <p className="text-xs text-muted-foreground">{item.date}</p>
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
            </div>
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
                  <a
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver comprobante
                  </a>
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
    </Tabs>
  );
}
