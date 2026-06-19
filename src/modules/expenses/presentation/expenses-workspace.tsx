"use client";

import * as React from "react";
import { Plus, ReceiptText, Tags, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type {
  ExpenseCategoryTotal,
  ExpenseCategoryWithUsage,
  ExpenseMetrics,
  ExpenseRow,
} from "@/modules/expenses/domain/entities";
import {
  adminCreateExpenseAction,
  adminCreateExpenseCategoryAction,
  adminDeleteExpenseAction,
  adminDeleteExpenseCategoryAction,
  adminUpdateExpenseAction,
  adminUpdateExpenseCategoryAction,
} from "@/app/actions/expenses-actions";
import { ExpenseFormDialog } from "./components/expense-form-dialog";
import { ExpensesTable } from "./components/expenses-table";
import { ExpenseCategoryFormDialog } from "./components/expense-category-form-dialog";
import { ExpenseCategoriesTable } from "./components/expense-categories-table";

type AccountOption = {
  id: string;
  name: string;
};

type ExpensesWorkspaceProps = {
  currency: SupportedCurrencyCode;
  metrics: ExpenseMetrics;
  expenses: ExpenseRow[];
  categories: ExpenseCategoryWithUsage[];
  categoryTotals: ExpenseCategoryTotal[];
  accounts: AccountOption[];
};

type TabKey = "gastos" | "categorias";

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

export function ExpensesWorkspace({
  currency,
  metrics,
  expenses,
  categories,
  categoryTotals,
  accounts,
}: ExpensesWorkspaceProps) {
  const [tab, setTab] = React.useState<TabKey>("gastos");
  const [expenseModal, setExpenseModal] = React.useState<
    | { mode: "create"; initialValue?: null }
    | { mode: "edit"; initialValue: ExpenseRow }
    | null
  >(null);
  const [categoryModal, setCategoryModal] = React.useState<
    | { mode: "create"; initialValue?: null }
    | { mode: "edit"; initialValue: ExpenseCategoryWithUsage }
    | null
  >(null);
  const [pendingExpenseDelete, setPendingExpenseDelete] = React.useState<ExpenseRow | null>(null);
  const [pendingCategoryDelete, setPendingCategoryDelete] = React.useState<ExpenseCategoryWithUsage | null>(null);

  const actionsReturnTo = "/admin/gastos";
  const categoryOptions = React.useMemo(
    () => categories.filter((category) => category.isActive).map((category) => ({ id: category.id, name: category.name })),
    [categories],
  );
  const maxCategoryTotal = categoryTotals[0]?.totalAmount ?? 0;

  return (
    <>
      <section className="space-y-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-foreground md:text-xl">
              <ReceiptText className="h-4 w-4 text-primary" />
              <span>Gastos</span>
            </h1>

            <div className="flex flex-wrap gap-2">
              {tab === "gastos" ? (
                <Button type="button" onClick={() => setExpenseModal({ mode: "create", initialValue: null })}>
                  <Plus className="h-4 w-4" />
                  Nuevo gasto
                </Button>
              ) : (
                <Button type="button" onClick={() => setCategoryModal({ mode: "create", initialValue: null })}>
                  <Plus className="h-4 w-4" />
                  Nueva categoria
                </Button>
              )}
            </div>
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} variant="line">
            <TabsList>
              <TabsTrigger value="gastos">
                <ReceiptText />
                Gastos
              </TabsTrigger>
              <TabsTrigger value="categorias">
                <Tags />
                Categorias
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Gasto total"
            value={formatMoney(metrics.totalAmount, currency)}
            helper={`${metrics.expenseCount} gastos registrados`}
            accent="danger"
          />
          <MetricCard
            title="Gasto del mes"
            value={formatMoney(metrics.currentMonthAmount, currency)}
            helper="Mes en curso"
            accent="info"
          />
          <MetricCard
            title="Categoria principal"
            value={metrics.topCategoryName ?? "Sin datos"}
            helper={metrics.topCategoryName ? formatMoney(metrics.topCategoryAmount, currency) : "Sin gastos aun"}
            accent="neutral"
          />
          <MetricCard
            title="Categorias"
            value={`${metrics.categoryCount}`}
            helper="Tipos de gasto definidos"
            accent="neutral"
          />
        </div>

        {tab === "gastos" ? (
          <div className="grid gap-4 xl:grid-cols-[1.6fr_0.8fr]">
            <ExpensesTable
              data={expenses}
              currency={currency}
              onEdit={(expenseId) => {
                const expense = expenses.find((row) => row.id === expenseId);
                if (expense) {
                  setExpenseModal({ mode: "edit", initialValue: expense });
                }
              }}
              onDelete={(expenseId) => {
                const expense = expenses.find((row) => row.id === expenseId);
                if (expense) {
                  setPendingExpenseDelete(expense);
                }
              }}
            />

            <Card className="border-border bg-card">
              <CardContent className="space-y-3 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Gasto por categoria</h3>
                  <p className="text-xs text-muted-foreground">Donde se concentra tu gasto.</p>
                </div>
                <div className="space-y-2">
                  {categoryTotals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
                  ) : (
                    categoryTotals.map((item) => (
                      <div key={item.categoryId} className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-foreground">{item.categoryName}</span>
                          <span className="text-sm font-semibold text-destructive">
                            {formatMoney(item.totalAmount, currency)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-destructive/70"
                            style={{ width: `${maxCategoryTotal > 0 ? (item.totalAmount / maxCategoryTotal) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === "categorias" ? (
          <ExpenseCategoriesTable
            data={categories}
            currency={currency}
            onEdit={(categoryId) => {
              const category = categories.find((row) => row.id === categoryId);
              if (category) {
                setCategoryModal({ mode: "edit", initialValue: category });
              }
            }}
            onDelete={(categoryId) => {
              const category = categories.find((row) => row.id === categoryId);
              if (category && category.expenseCount === 0) {
                setPendingCategoryDelete(category);
              }
            }}
          />
        ) : null}
      </section>

      <ExpenseFormDialog
        open={Boolean(expenseModal)}
        mode={expenseModal?.mode ?? "create"}
        action={expenseModal?.mode === "edit" ? adminUpdateExpenseAction : adminCreateExpenseAction}
        onClose={() => setExpenseModal(null)}
        returnTo={actionsReturnTo}
        categories={categoryOptions}
        accounts={accounts}
        initialValue={
          expenseModal?.mode === "edit"
            ? {
                expenseId: expenseModal.initialValue.id,
                categoryId: expenseModal.initialValue.categoryId,
                accountId: expenseModal.initialValue.accountId,
                amount: expenseModal.initialValue.amount,
                description: expenseModal.initialValue.description,
                reference: expenseModal.initialValue.reference,
                expenseDate: new Date(expenseModal.initialValue.expenseDate).toISOString().slice(0, 10),
              }
            : null
        }
      />

      <ExpenseCategoryFormDialog
        open={Boolean(categoryModal)}
        mode={categoryModal?.mode ?? "create"}
        action={categoryModal?.mode === "edit" ? adminUpdateExpenseCategoryAction : adminCreateExpenseCategoryAction}
        onClose={() => setCategoryModal(null)}
        returnTo={actionsReturnTo}
        initialValue={categoryModal?.mode === "edit" ? categoryModal.initialValue : null}
      />

      {pendingExpenseDelete ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar gasto"
          onClick={() => setPendingExpenseDelete(null)}
        >
          <Card className="w-full max-w-md rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
            <CardContent className="space-y-4 p-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Eliminar gasto</h3>
                <p className="text-sm text-muted-foreground">
                  Se eliminara el gasto de{" "}
                  <span className="font-medium text-foreground">{pendingExpenseDelete.categoryName}</span> por{" "}
                  {formatMoney(pendingExpenseDelete.amount, currency)}. El balance de la cuenta volvera a subir.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPendingExpenseDelete(null)}>
                  Cancelar
                </Button>
                <form action={adminDeleteExpenseAction}>
                  <input type="hidden" name="expenseId" value={pendingExpenseDelete.id} />
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

      {pendingCategoryDelete ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar categoria"
          onClick={() => setPendingCategoryDelete(null)}
        >
          <Card className="w-full max-w-md rounded-2xl p-0" onClick={(event) => event.stopPropagation()}>
            <CardContent className="space-y-4 p-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Eliminar categoria</h3>
                <p className="text-sm text-muted-foreground">
                  Se eliminara la categoria{" "}
                  <span className="font-medium text-foreground">{pendingCategoryDelete.name}</span>.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPendingCategoryDelete(null)}>
                  Cancelar
                </Button>
                <form action={adminDeleteExpenseCategoryAction}>
                  <input type="hidden" name="categoryId" value={pendingCategoryDelete.id} />
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
