"use client";

import * as React from "react";
import { Landmark, Plus, ReceiptText, Truck, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { adminCreateAccountAction, adminCreateAccountMovementAction, adminCreateShippingCostAction, adminCreateSupplierPaymentAction, adminDeleteShippingCostAction, adminDeleteSupplierPaymentAction, adminUpdateAccountAction, adminUpdateShippingCostAction, adminUpdateSupplierPaymentAction } from "@/app/actions/balances-actions";
import { SupplierPaymentFormDialog } from "./components/supplier-payment-form-dialog";
import { ShippingCostFormDialog } from "./components/shipping-cost-form-dialog";
import { PaymentHistoryTable } from "./components/payment-history-table";
import { ShippingCostsTable } from "./components/shipping-costs-table";
import { ProfitReportTable } from "./components/profit-report-table";
import { ProfitChart } from "./components/profit-chart";
import { SupplierBalancesTable } from "./components/supplier-balances-table";
import { AccountBalancesTable } from "./components/account-balances-table";
import { AccountFormDialog } from "./components/account-form-dialog";
import { AccountMovementFormDialog } from "./components/account-movement-form-dialog";

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
};

type TabKey = "overview" | "payments" | "shipping" | "reports" | "cuentas";

function MetricCard({
  title,
  value,
  helper,
  accent = "neutral",
}: {
  title: string;
  value: string;
  helper: string;
  accent?: "neutral" | "success" | "danger" | "info";
}) {
  const toneClass =
    accent === "success"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : accent === "danger"
        ? "border-destructive/20 bg-destructive/5"
        : accent === "info"
          ? "border-primary/20 bg-primary/5"
          : "border-border bg-card";

  return (
    <Card className={`${toneClass} py-2`}>
      <CardContent className="space-y-0.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

export function BalancesWorkspace({
  currency,
  metrics,
  supplierBalances,
  paymentHistory,
  shippingCosts,
  profitReport,
  sales,
  suppliers,
  accounts,
}: BalancesWorkspaceProps) {
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [supplierPaymentModal, setSupplierPaymentModal] = React.useState<
    | { mode: "create"; initialValue?: null }
    | { mode: "edit"; initialValue: PaymentHistoryRow }
    | null
  >(null);
  const [shippingCostModal, setShippingCostModal] = React.useState<
    | { mode: "create"; initialValue?: null }
    | { mode: "edit"; initialValue: ShippingCostRow }
    | null
  >(null);
  const [accountModal, setAccountModal] = React.useState<
    | { mode: "create"; initialValue?: null }
    | { mode: "edit"; initialValue: AccountBalance }
    | null
  >(null);
  const [accountMovementOpen, setAccountMovementOpen] = React.useState(false);
  const [pendingSupplierPaymentDelete, setPendingSupplierPaymentDelete] = React.useState<PaymentHistoryRow | null>(null);
  const [pendingShippingCostDelete, setPendingShippingCostDelete] = React.useState<ShippingCostRow | null>(null);

  const accountOptions = React.useMemo(
    () => accounts.filter((account) => account.isActive).map((account) => ({ id: account.id, name: account.name })),
    [accounts],
  );

  const actionsReturnTo = "/admin/balances";
  const topSales = [...profitReport].sort((a, b) => b.netProfit - a.netProfit).slice(0, 5);
  const bottomSales = [...profitReport].sort((a, b) => a.netProfit - b.netProfit).slice(0, 5);

  return (
    <>
      <section className="space-y-4">
        <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-foreground md:text-xl">
                <Landmark className="h-4 w-4 text-primary" />
                <span>Balances y rentabilidad</span>
              </h1>

              <div className="flex flex-wrap gap-2">
                {tab === "payments" ? (
                  <Button type="button" variant="outline" onClick={() => setSupplierPaymentModal({ mode: "create", initialValue: null })}>
                    <Plus className="h-4 w-4" />
                    Nuevo pago
                  </Button>
                ) : null}
                {tab === "shipping" ? (
                  <Button type="button" variant="outline" onClick={() => setShippingCostModal({ mode: "create", initialValue: null })}>
                    <Truck className="h-4 w-4" />
                    Costo de envio
                  </Button>
                ) : null}
                {tab === "cuentas" ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => setAccountMovementOpen(true)}>
                      <Wallet className="h-4 w-4" />
                      Movimiento
                    </Button>
                    <Button type="button" onClick={() => setAccountModal({ mode: "create", initialValue: null })}>
                      <Plus className="h-4 w-4" />
                      Nueva cuenta
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} variant="line">
              <TabsList>
                <TabsTrigger value="overview">
                  <TrendingUp />
                  Resumen
                </TabsTrigger>
                <TabsTrigger value="payments">
                  <ReceiptText />
                  Pagos
                </TabsTrigger>
                <TabsTrigger value="shipping">
                  <Truck />
                  Envios
                </TabsTrigger>
                <TabsTrigger value="reports">
                  <Landmark />
                  Reportes
                </TabsTrigger>
                <TabsTrigger value="cuentas">
                  <Wallet />
                  Cuentas
                </TabsTrigger>
              </TabsList>
            </Tabs>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Ventas totales" value={formatMoney(metrics.salesTotal, currency)} helper={`${metrics.salesCount} ventas analizadas`} accent="info" />
          <MetricCard title="Costos totales" value={formatMoney(metrics.supplierCosts, currency)} helper="Costo proveedores" accent="danger" />
          <MetricCard title="Costos de envio" value={formatMoney(metrics.shippingCosts, currency)} helper="Fletes y transportes" accent="danger" />
          <MetricCard title="Ganancia neta" value={formatMoney(metrics.netProfit, currency)} helper={`${metrics.marginPercentage.toFixed(2)}% de margen`} accent={metrics.netProfit >= 0 ? "success" : "danger"} />
        </div>

        {tab === "overview" ? (
          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
            <ProfitChart data={profitReport} />
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

        {tab === "payments" ? (
          <PaymentHistoryTable
            data={paymentHistory}
            currency={currency}
            onEdit={(paymentId) => {
              const payment = paymentHistory.find((row) => row.id === paymentId);
              if (payment) {
                setSupplierPaymentModal({ mode: "edit", initialValue: payment });
              }
            }}
            onDelete={(paymentId) => {
              const payment = paymentHistory.find((row) => row.id === paymentId);
              if (payment) {
                setPendingSupplierPaymentDelete(payment);
              }
            }}
          />
        ) : null}

        {tab === "shipping" ? (
          <ShippingCostsTable
            data={shippingCosts}
            currency={currency}
            onEdit={(shippingCostId) => {
              const shippingCost = shippingCosts.find((row) => row.id === shippingCostId);
              if (shippingCost) {
                setShippingCostModal({ mode: "edit", initialValue: shippingCost });
              }
            }}
            onDelete={(shippingCostId) => {
              const shippingCost = shippingCosts.find((row) => row.id === shippingCostId);
              if (shippingCost) {
                setPendingShippingCostDelete(shippingCost);
              }
            }}
          />
        ) : null}

        {tab === "reports" ? (
          <div className="space-y-4">
            <ProfitReportTable data={profitReport} currency={currency} />
            <SupplierBalancesTable data={supplierBalances} currency={currency} />
          </div>
        ) : null}

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

      <SupplierPaymentFormDialog
        open={Boolean(supplierPaymentModal)}
        mode={supplierPaymentModal?.mode ?? "create"}
        action={supplierPaymentModal?.mode === "edit" ? adminUpdateSupplierPaymentAction : adminCreateSupplierPaymentAction}
        onClose={() => setSupplierPaymentModal(null)}
        returnTo={actionsReturnTo}
        sales={sales}
        suppliers={suppliers}
        accounts={accountOptions}
        initialValue={
          supplierPaymentModal?.mode === "edit"
            ? {
                paymentId: supplierPaymentModal.initialValue.id,
                saleId: supplierPaymentModal.initialValue.saleId,
                supplierId: supplierPaymentModal.initialValue.supplierId,
                amount: supplierPaymentModal.initialValue.amount,
                transactionReference: supplierPaymentModal.initialValue.transactionReference,
                paymentDate: new Date(supplierPaymentModal.initialValue.paymentDate).toISOString().slice(0, 10),
                notes: supplierPaymentModal.initialValue.notes,
                accountId: supplierPaymentModal.initialValue.accountId,
                receiptUrl: supplierPaymentModal.initialValue.receiptUrl,
                receiptName: supplierPaymentModal.initialValue.receiptName,
              }
            : null
        }
      />

      <ShippingCostFormDialog
        open={Boolean(shippingCostModal)}
        mode={shippingCostModal?.mode ?? "create"}
        action={shippingCostModal?.mode === "edit" ? adminUpdateShippingCostAction : adminCreateShippingCostAction}
        onClose={() => setShippingCostModal(null)}
        returnTo={actionsReturnTo}
        sales={sales}
        accounts={accountOptions}
        initialValue={
          shippingCostModal?.mode === "edit"
            ? {
                shippingCostId: shippingCostModal.initialValue.id,
                saleId: shippingCostModal.initialValue.saleId,
                shippingProvider: shippingCostModal.initialValue.shippingProvider,
                amount: shippingCostModal.initialValue.amount,
                transactionReference: shippingCostModal.initialValue.transactionReference,
                paymentDate: new Date(shippingCostModal.initialValue.paymentDate).toISOString().slice(0, 10),
                accountId: shippingCostModal.initialValue.accountId,
              }
            : null
        }
      />

      <AccountFormDialog
        open={Boolean(accountModal)}
        mode={accountModal?.mode ?? "create"}
        action={accountModal?.mode === "edit" ? adminUpdateAccountAction : adminCreateAccountAction}
        onClose={() => setAccountModal(null)}
        returnTo={actionsReturnTo}
        initialValue={accountModal?.mode === "edit" ? accountModal.initialValue : null}
      />

      <AccountMovementFormDialog
        open={accountMovementOpen}
        action={adminCreateAccountMovementAction}
        onClose={() => setAccountMovementOpen(false)}
        returnTo={actionsReturnTo}
        accounts={accountOptions}
      />

      {pendingSupplierPaymentDelete ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar pago"
          onClick={() => setPendingSupplierPaymentDelete(null)}
        >
          <Card className="w-full max-w-md rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
            <CardContent className="space-y-4 p-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Eliminar pago</h3>
                <p className="text-sm text-muted-foreground">
                  Se eliminara el pago de <span className="font-medium text-foreground">{pendingSupplierPaymentDelete.supplierName}</span> por {formatMoney(pendingSupplierPaymentDelete.amount, currency)}.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPendingSupplierPaymentDelete(null)}>
                  Cancelar
                </Button>
                <form action={adminDeleteSupplierPaymentAction}>
                  <input type="hidden" name="paymentId" value={pendingSupplierPaymentDelete.id} />
                  <input type="hidden" name="returnTo" value={actionsReturnTo} />
                  <Button type="submit" variant="destructive">
                    Eliminar
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {pendingShippingCostDelete ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar costo de envio"
          onClick={() => setPendingShippingCostDelete(null)}
        >
          <Card className="w-full max-w-md rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
            <CardContent className="space-y-4 p-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Eliminar costo de envio</h3>
                <p className="text-sm text-muted-foreground">
                  Se eliminara el registro de {pendingShippingCostDelete.shippingProvider} por {formatMoney(pendingShippingCostDelete.amount, currency)}.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPendingShippingCostDelete(null)}>
                  Cancelar
                </Button>
                <form action={adminDeleteShippingCostAction}>
                  <input type="hidden" name="shippingCostId" value={pendingShippingCostDelete.id} />
                  <input type="hidden" name="returnTo" value={actionsReturnTo} />
                  <Button type="submit" variant="destructive">
                    Eliminar
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
