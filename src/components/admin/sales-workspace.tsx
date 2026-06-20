"use client";

import * as React from "react";
import { BadgeDollarSign, ChevronDown, Paintbrush, Search } from "lucide-react";
import { SalesDataTable } from "@/components/admin/sales-data-table";
import { DirectSaleSheet, type DirectSaleProduct, type DirectSaleClient } from "@/components/admin/direct-sale-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
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

function todayInputValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function firstDayOfMonthInput(): string {
  return `${todayInputValue().slice(0, 8)}01`;
}

// Convierte un instante ISO (UTC) al día en la zona horaria local del navegador.
function isoToLocalDay(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const SALE_STATUS_OPTIONS: { value: SaleStatus; label: string }[] = [
  { value: "DRAFT", label: "Borrador" },
  { value: "ACTIVE", label: "Activa" },
  { value: "INVOICED", label: "Facturada" },
  { value: "COMPLETED", label: "Finalizada" },
  { value: "CANCELLED", label: "Cancelada" },
];

const DEFAULT_STATUS_FILTER: SaleStatus[] = SALE_STATUS_OPTIONS.map((option) => option.value);

export function SalesWorkspace({ sales, currency, accounts, products, clients, initialSearch = "" }: SalesWorkspaceProps) {
  const [search, setSearch] = React.useState(initialSearch);
  const [statusFilter, setStatusFilter] = React.useState<SaleStatus[]>(DEFAULT_STATUS_FILTER);
  // Si llegamos con una búsqueda inicial (p. ej. desde una cotización), no acotamos por fecha
  // para no ocultar ventas de meses anteriores.
  const [dateFrom, setDateFrom] = React.useState(initialSearch ? "" : firstDayOfMonthInput());
  const [dateTo, setDateTo] = React.useState(initialSearch ? "" : todayInputValue());

  const filteredSales = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return sales.filter((sale) => {
      if (!statusFilter.includes(sale.status)) return false;
      const day = isoToLocalDay(sale.createdAtISO);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (term && !`${sale.code} ${sale.quoteCode} ${sale.clientName}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [sales, search, statusFilter, dateFrom, dateTo]);

  const stats = React.useMemo(() => {
    return {
      salesCount: filteredSales.length,
      downPaymentTotal: filteredSales.reduce((sum, sale) => sum + sale.downPaymentAmount, 0),
      remainingTotal: filteredSales.reduce((sum, sale) => sum + sale.remainingBalance, 0),
    };
  }, [filteredSales]);

  const toggleStatusFilter = React.useCallback((status: SaleStatus) => {
    setStatusFilter((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    );
  }, []);

  const resetFilters = React.useCallback(() => {
    setSearch("");
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setDateFrom(firstDayOfMonthInput());
    setDateTo(todayInputValue());
  }, []);

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

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Buscar por venta, cotización o cliente"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Estados</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-2">
                    <span>
                      {statusFilter.length === 0
                        ? "Ninguno"
                        : statusFilter.length === SALE_STATUS_OPTIONS.length
                          ? "Todos los estados"
                          : `${statusFilter.length} seleccionados`}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel>Filtrar por estado</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SALE_STATUS_OPTIONS.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={statusFilter.includes(option.value)}
                      onCheckedChange={() => toggleStatusFilter(option.value)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DatePicker
              value={dateFrom}
              onChange={setDateFrom}
              className="w-40"
              placeholder="Desde"
              aria-label="Desde"
            />
            <DatePicker
              value={dateTo}
              onChange={setDateTo}
              className="w-40"
              placeholder="Hasta"
              aria-label="Hasta"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={resetFilters}
              aria-label="Limpiar filtros"
              title="Limpiar filtros"
            >
              <Paintbrush className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <SalesDataTable sales={filteredSales} currency={currency} accounts={accounts} />
    </section>
  );
}
