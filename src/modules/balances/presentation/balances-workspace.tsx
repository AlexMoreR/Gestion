"use client";

import * as React from "react";
import { BadgeDollarSign, Landmark, ReceiptText, Scale, TrendingUp, Truck, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatList } from "@/components/ui/stat-list";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type {
  AccountBalance,
  DashboardMetrics,
  PaymentHistoryRow,
  SaleProfit,
  ShippingCostRow,
  SupplierBalance,
} from "@/modules/balances/domain/entities";
import { adminCreateAccountAction, adminUpdateAccountAction } from "@/app/actions/balances-actions";
import { ProfitReportTable } from "./components/profit-report-table";
import { ProfitChart } from "./components/profit-chart";
import { AccountBalancesTable } from "./components/account-balances-table";
import { AccountFormDialog } from "./components/account-form-dialog";
import { MonthFilter } from "./components/month-filter";
import { ExpensesWorkspace } from "@/modules/expenses/presentation/expenses-workspace";

type SaleOption = {
  id: string;
  code: string;
  total: number;
  clientName: string | null;
};

type SupplierOption = {
  id: string;
  name: string;
};

type BalancesWorkspaceProps = {
  currency: SupportedCurrencyCode;
  metrics: DashboardMetrics;
  supplierBalances: SupplierBalance[];
  paymentHistory: PaymentHistoryRow[];
  shippingCosts: ShippingCostRow[];
  profitReport: SaleProfit[];
  sales: SaleOption[];
  suppliers: SupplierOption[];
  accounts: AccountBalance[];
  // Mes seleccionado (YYYY-MM) y su etiqueta legible para el selector.
  monthValue: string;
  monthLabel: string;
  // Datos del modulo de Gastos, reusados en la pestaña "Gastos".
  expensesData: React.ComponentProps<typeof ExpensesWorkspace>;
};

type TabKey = "overview" | "reports" | "cuentas" | "gastos";

export function BalancesWorkspace({
  currency,
  metrics,
  profitReport,
  accounts,
  monthValue,
  monthLabel,
  expensesData,
}: BalancesWorkspaceProps) {
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [accountModal, setAccountModal] = React.useState<
    | { mode: "create"; initialValue?: null }
    | { mode: "edit"; initialValue: AccountBalance }
    | null
  >(null);
  const actionsReturnTo = "/admin/balances";
  const topSales = [...profitReport].sort((a, b) => b.netProfit - a.netProfit).slice(0, 5);
  const bottomSales = [...profitReport].sort((a, b) => a.netProfit - b.netProfit).slice(0, 5);

  // metrics.netProfit solo descuenta costos de venta (proveedores + envios). La
  // ganancia real del mes resta ademas los gastos operativos (nomina, etc.).
  const directCosts = metrics.supplierCosts + metrics.shippingCosts;
  const operatingExpenses = expensesData.metrics.totalAmount;
  const realNetProfit = metrics.salesTotal - directCosts - operatingExpenses;
  const realMargin = metrics.salesTotal > 0 ? (realNetProfit / metrics.salesTotal) * 100 : 0;

  return (
    <>
      <section className="space-y-4">
        <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              <MonthFilter value={monthValue} label={monthLabel} />
            </div>

            <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} variant="line">
              <TabsList>
                <TabsTrigger value="overview">
                  <TrendingUp />
                  Resumen
                </TabsTrigger>
                <TabsTrigger value="reports">
                  <Landmark />
                  Ventas
                </TabsTrigger>
                <TabsTrigger value="gastos">
                  <ReceiptText />
                  Gastos
                </TabsTrigger>
                <TabsTrigger value="cuentas">
                  <Wallet />
                  Cuentas
                </TabsTrigger>
              </TabsList>
            </Tabs>
        </div>

        {tab === "gastos" ? null : (
          <StatList
            items={[
              {
                label: "Ventas",
                value: formatMoney(metrics.salesTotal, currency),
                helper: `${metrics.salesCount} ventas · ${monthLabel}`,
                icon: BadgeDollarSign,
                tone: "info",
              },
              {
                label: "Costos",
                value: formatMoney(directCosts, currency),
                helper: "Proveedores y envios",
                icon: Truck,
                tone: "danger",
              },
              {
                label: "Gastos",
                value: formatMoney(operatingExpenses, currency),
                helper: "Nomina, marketing y varios",
                icon: ReceiptText,
                tone: "danger",
              },
              {
                label: "Ganancias",
                value: formatMoney(realNetProfit, currency),
                helper: `${realMargin.toFixed(2)}% de margen`,
                icon: Scale,
                tone: realNetProfit >= 0 ? "success" : "danger",
              },
            ]}
          />
        )}

        {tab === "overview" ? (
          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
            <ProfitChart data={profitReport} currency={currency} />
            <div className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="space-y-3 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Ventas mas rentables</h3>
                    <p className="text-xs text-muted-foreground">Donde se concentra el margen positivo.</p>
                  </div>
                  <div className="space-y-2">
                    {topSales.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
                    ) : (
                      topSales.map((sale) => (
                        <div key={sale.saleId} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{sale.saleCode}</p>
                            <p className="text-xs text-muted-foreground">{sale.clientName ?? "Sin cliente"}</p>
                          </div>
                          <p className="text-sm font-semibold text-emerald-600">{formatMoney(sale.netProfit, currency)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="space-y-3 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Ventas menos rentables</h3>
                    <p className="text-xs text-muted-foreground">Detecta fugas de margen y sobrecostos.</p>
                  </div>
                  <div className="space-y-2">
                    {bottomSales.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
                    ) : (
                      bottomSales.map((sale) => (
                        <div key={sale.saleId} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{sale.saleCode}</p>
                            <p className="text-xs text-muted-foreground">{sale.clientName ?? "Sin cliente"}</p>
                          </div>
                          <p className={`text-sm font-semibold ${sale.netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {formatMoney(sale.netProfit, currency)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {tab === "reports" ? (
          <div className="space-y-4">
            <ProfitReportTable data={profitReport} currency={currency} />
          </div>
        ) : null}

        {tab === "gastos" ? <ExpensesWorkspace {...expensesData} embedded /> : null}

        {tab === "cuentas" ? (
          <AccountBalancesTable
            data={accounts}
            currency={currency}
            onEdit={(accountId) => {
              const account = accounts.find((row) => row.id === accountId);
              if (account) {
                setAccountModal({ mode: "edit", initialValue: account });
              }
            }}
          />
        ) : null}
      </section>

      <AccountFormDialog
        open={Boolean(accountModal)}
        mode={accountModal?.mode ?? "create"}
        action={accountModal?.mode === "edit" ? adminUpdateAccountAction : adminCreateAccountAction}
        onClose={() => setAccountModal(null)}
        returnTo={actionsReturnTo}
        initialValue={accountModal?.mode === "edit" ? accountModal.initialValue : null}
      />
    </>
  );
}
