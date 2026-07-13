"use client";

import * as React from "react";
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

// Fecha local (YYYY-MM-DD) para comparar con el DateRangePicker.
function localDay(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

// Rango por defecto: primer y ultimo dia del mes actual (en hora local).
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const toLocalISO = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toLocalISO(first), to: toLocalISO(last) };
}

export function SalesWorkspace({ sales, currency, accounts, products, clients, initialSearch = "" }: SalesWorkspaceProps) {
  const defaultRange = React.useMemo(() => currentMonthRange(), []);
  const [fromDate, setFromDate] = React.useState(defaultRange.from);
  const [toDate, setToDate] = React.useState(defaultRange.to);
  const [statusFilter, setStatusFilter] = React.useState<SaleStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = React.useState(initialSearch);

  // Dia de hoy (hora local) para arrastrar las ventas pendientes al presente.
  const todayDay = React.useMemo(() => localDay(new Date().toISOString()), []);

  // El rango de fechas y el estado se aplican aqui para que las tarjetas y la
  // tabla compartan exactamente el mismo conjunto de ventas.
  const filteredSales = React.useMemo(
    () =>
      sales.filter((sale) => {
        if (statusFilter !== "ALL" && sale.status !== statusFilter) return false;
        // Las ventas con saldo por cobrar se "arrastran" al mes actual: se
        // filtran por la fecha de hoy (no por su fecha real), asi siguen
        // visibles hasta que se cobren. Las saldadas usan su fecha real.
        const isPending = sale.remainingBalance > 0 && sale.status !== "CANCELLED";
        const day = isPending ? todayDay : localDay(sale.createdAtISO);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        return true;
      }),
    [sales, fromDate, toDate, statusFilter, todayDay],
  );

  // Al buscar, la busqueda abarca TODAS las ventas (el filtro de mes/estado solo
  // aplica por defecto). Las tarjetas siguen reflejando el mes filtrado.
  const tableSales = searchQuery.trim() ? sales : filteredSales;

  const stats = React.useMemo(() => {
    return {
      salesCount: filteredSales.length,
      toCollectCount: filteredSales.filter((sale) => sale.status === "ACTIVE").length,
      downPaymentTotal: filteredSales.reduce((sum, sale) => sum + sale.downPaymentAmount, 0),
      remainingTotal: filteredSales.reduce((sum, sale) => sum + sale.remainingBalance, 0),
    };
  }, [filteredSales]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <DirectSaleSheet products={products} clients={clients} currency={currency} accounts={accounts} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ventas</p>
            <p className="text-lg font-semibold text-foreground">{stats.salesCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95 py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Cobrar</p>
            <p className="text-lg font-semibold text-foreground">{stats.toCollectCount}</p>
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

      <SalesDataTable
        sales={tableSales}
        currency={currency}
        accounts={accounts}
        initialSearch={initialSearch}
        onSearchChange={setSearchQuery}
        fromDate={fromDate}
        toDate={toDate}
        statusFilter={statusFilter}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onStatusFilterChange={setStatusFilter}
      />
    </section>
  );
}
