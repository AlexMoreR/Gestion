"use client";

import * as React from "react";
import { SalesDataTable } from "@/components/admin/sales-data-table";
import { colombiaDayKey, colombiaMonthRange, todayInColombia } from "@/lib/colombia-time";
import { DirectSaleSheet, type DirectSaleProduct, type DirectSaleClient } from "@/components/admin/direct-sale-sheet";
import { ArrowDownLeft, Clock, ShoppingCart, Wallet } from "lucide-react";
import { StatList } from "@/components/ui/stat-list";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type { SalePaymentMethod } from "@/modules/ventas/domain/payment-method";
import type { SaleOriginCode } from "@/modules/ventas/domain/sale-origin";

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
  pendingDelivery?: boolean;
  salePaymentMethod: SalePaymentMethod | null;
  saleOrigin: SaleOriginCode | null;
  saleOriginDetail: unknown;
  hasCamillaCombo: boolean;
  alertaCombo?: boolean;
  alertaReversa?: string | null;
};

type AccountType = "CASH" | "BANK" | "WALLET" | "OTHER" | "OWNER";

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
  /** Solo el dueño (permiso "Borrado definitivo"). */
  canHardDelete?: boolean;
};

// Dia en Colombia (YYYY-MM-DD) para comparar con el DateRangePicker.
function localDay(value: string): string {
  return colombiaDayKey(new Date(value));
}

// Rango por defecto: primer y ultimo dia del mes actual en Colombia.
function currentMonthRange(): { from: string; to: string } {
  const month = todayInColombia().slice(0, 7);
  const { end } = colombiaMonthRange(month);
  return { from: `${month}-01`, to: colombiaDayKey(new Date(end.getTime() - 60 * 60 * 1000)) };
}

export function SalesWorkspace({
  sales,
  currency,
  accounts,
  products,
  clients,
  initialSearch = "",
  canHardDelete = false,
}: SalesWorkspaceProps) {
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
    // Una venta anulada se ve en la tabla pero no suma en las tarjetas.
    const counted = filteredSales.filter((sale) => sale.status !== "CANCELLED");
    return {
      salesCount: counted.length,
      toCollectCount: counted.filter((sale) => sale.status === "ACTIVE").length,
      downPaymentTotal: counted.reduce((sum, sale) => sum + sale.downPaymentAmount, 0),
      remainingTotal: counted.reduce((sum, sale) => sum + sale.remainingBalance, 0),
    };
  }, [filteredSales]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <DirectSaleSheet products={products} clients={clients} currency={currency} accounts={accounts} />
      </div>

      <StatList
        items={[
          { label: "Ventas", value: String(stats.salesCount), icon: ShoppingCart },
          { label: "Cobrar", value: String(stats.toCollectCount), icon: Clock },
          { label: "Abonos", value: formatMoney(stats.downPaymentTotal, currency), icon: ArrowDownLeft, tone: "success" },
          { label: "Saldo", value: formatMoney(stats.remainingTotal, currency), icon: Wallet },
        ]}
      />

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
        canHardDelete={canHardDelete}
      />
    </section>
  );
}
