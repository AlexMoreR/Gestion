"use client";

import { BadgeDollarSign } from "lucide-react";
import { SalesDataTable } from "@/components/admin/sales-data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SupportedCurrencyCode } from "@/lib/currency";

type SaleRow = {
  id: string;
  code: string;
  quoteCode: string;
  clientName: string;
  total: number;
  downPaymentAmount: number;
  remainingBalance: number;
  status: "DRAFT" | "ACTIVE" | "INVOICED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  invoiceToken: string;
  paymentReceiptUrl: string;
  paymentReceiptType: string;
};

type SalesWorkspaceProps = {
  sales: SaleRow[];
  currency: SupportedCurrencyCode;
  stats: {
    salesCount: number;
    capitalTotal: number;
    downPaymentTotal: number;
    remainingTotal: number;
    paidSalesCount: number;
  };
};

export function SalesWorkspace({ sales, currency, stats }: SalesWorkspaceProps) {
  return (
    <section className="space-y-4">
      <Card className="border border-border bg-card/95">
        <CardContent className="space-y-2">

          <div className="flex flex-row items-center gap-1">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,white)] text-primary">
              <BadgeDollarSign className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">Ventas</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Revise los presupuestos convertidos, abra la factura o descargue la versión en PDF.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Sales count</p>
            <p className="text-2xl font-semibold text-foreground">{stats.salesCount}</p>
            <p className="text-xs text-muted-foreground">Total registered sales</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Capital</p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.capitalTotal.toLocaleString("es-CO", { style: "currency", currency })}
            </p>
            <p className="text-xs text-muted-foreground">Gross sales value</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Down payments</p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.downPaymentTotal.toLocaleString("es-CO", { style: "currency", currency })}
            </p>
            <p className="text-xs text-muted-foreground">Collected deposits</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Remaining balance</p>
            <p className="text-2xl font-semibold text-foreground">
              {stats.remainingTotal.toLocaleString("es-CO", { style: "currency", currency })}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Paid sales</p>
              <Badge variant="outline">{stats.paidSalesCount}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <SalesDataTable sales={sales} currency={currency} />
    </section>
  );
}
