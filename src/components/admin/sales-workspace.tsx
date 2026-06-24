"use client";

import * as React from "react";
import { BadgeDollarSign } from "lucide-react";
import { SalesDataTable } from "@/components/admin/sales-data-table";
import { DirectSaleSheet, type DirectSaleProduct, type DirectSaleClient } from "@/components/admin/direct-sale-sheet";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";

type SaleStatus = "DRAFT" | "ACTIVE" | "INVOICED" | "COMPLETED" | "CANCELLED";

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
  status: SaleStatus;
  createdAt: string;
  createdAtISO: string;
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
  orderId: string | null;
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
  initialSearch?: string;
};

export function SalesWorkspace({ sales, currency, accounts, products, clients, initialSearch = "" }: SalesWorkspaceProps) {
  const stats = React.useMemo(() => {
    return {
      salesCount: sales.length,
      downPaymentTotal: sales.reduce((sum, sale) => sum + sale.downPaymentAmount, 0),
      remainingTotal: sales.reduce((sum, sale) => sum + sale.remainingBalance, 0),
    };
  }, [sales]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-foreground md:text-xl">
          <BadgeDollarSign className="h-4 w-4 text-primary" />
          <span>Ventas</span>
        </h1>
        <DirectSaleSheet products={products} clients={clients} currency={currency} accounts={accounts} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ventas</p>
            <p className="text-lg font-semibold text-foreground">{stats.salesCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Abonos</p>
            <p className="text-lg font-semibold text-foreground">{formatMoney(stats.downPaymentTotal, currency)}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Saldo</p>
            <p className="text-lg font-semibold text-foreground">{formatMoney(stats.remainingTotal, currency)}</p>
          </CardContent>
        </Card>
      </div>

      <SalesDataTable sales={sales} currency={currency} accounts={accounts} initialSearch={initialSearch} />
    </section>
  );
}
