"use client";

import { BadgeDollarSign } from "lucide-react";
import { SalesDataTable } from "@/components/admin/sales-data-table";
import { DirectSaleSheet, type DirectSaleProduct, type DirectSaleClient } from "@/components/admin/direct-sale-sheet";
import { Card, CardContent } from "@/components/ui/card";
import type { SupportedCurrencyCode } from "@/lib/currency";

type SaleRow = {
  id: string;
  code: string;
  quoteCode: string;
  clientName: string;
  total: number;
  grossTotal: number;
  discountAmount: number;
  downPaymentAmount: number;
  remainingBalance: number;
  status: "DRAFT" | "ACTIVE" | "INVOICED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  invoiceToken: string;
  paymentReceiptUrl: string;
  paymentReceiptType: string;
  salePayments: Array<{
    id: string;
    amount: number;
    paymentMethod: string;
    note: string | null;
    receiptUrl: string | null;
    receiptName: string | null;
    receiptType: string | null;
    paidAt: string | null;
  }>;
  hasOrder: boolean;
};

type AccountType = "CASH" | "BANK" | "WALLET" | "OTHER";

type AccountOption = {
  id: string;
  name: string;
  type: AccountType;
};

type SalesWorkspaceProps = {
  sales: SaleRow[];
  currency: SupportedCurrencyCode;
  accounts: AccountOption[];
  products: DirectSaleProduct[];
  clients: DirectSaleClient[];
  stats: {
    salesCount: number;
    grossTotal: string;
    discountTotal: string;
    capitalTotal: string;
    downPaymentTotal: string;
    remainingTotal: string;
    paidSalesCount: number;
  };
};

export function SalesWorkspace({ sales, currency, accounts, products, clients, stats }: SalesWorkspaceProps) {
  return (
    <section className="space-y-4">
      <Card className="border border-border bg-card/95">
        <CardContent className="space-y-2">
          <div className="flex flex-row items-center justify-between gap-2">
            <div className="flex flex-row items-center gap-1">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,white)] text-primary">
                <BadgeDollarSign className="h-5 w-5" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">Ventas</h1>
            </div>
            <DirectSaleSheet products={products} clients={clients} currency={currency} accounts={accounts} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Ventas</p>
            <p className="text-2xl font-semibold text-foreground">{stats.salesCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Abonos</p>
            <p className="text-2xl font-semibold text-foreground">{stats.downPaymentTotal}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Saldo</p>
            <p className="text-2xl font-semibold text-foreground">{stats.remainingTotal}</p>
          </CardContent>
        </Card>
      </div>

      <SalesDataTable sales={sales} currency={currency} accounts={accounts} />
    </section>
  );
}
