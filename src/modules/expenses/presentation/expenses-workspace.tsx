"use client";

import * as React from "react";
import { CalendarDays, Plus, ReceiptText, Tags } from "lucide-react";
import { StatList } from "@/components/ui/stat-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, type SupportedCurrencyCode } from "@/lib/currency";
import type {
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
  isCash: boolean;
};

type EmployeeOption = {
  id: string;
  name: string;
};

type ExpensesWorkspaceProps = {
  currency: SupportedCurrencyCode;
  metrics: ExpenseMetrics;
  expenses: ExpenseRow[];
  categories: ExpenseCategoryWithUsage[];
  accounts: AccountOption[];
  employees: EmployeeOption[];
  /**
   * Modo embebido (p. ej. dentro de Balances): oculta la cabecera propia,
   * el boton de alta y las sub-pestañas. Queda solo el contenido informativo.
   */
  embedded?: boolean;
};

type TabKey = "gastos" | "categorias";

// Primer y ultimo dia del mes en curso (YYYY-MM-DD), en hora de Colombia
// (UTC-5) para que la noche del ultimo dia no salte al mes siguiente.
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const bogotaNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const year = bogotaNow.getUTCFullYear();
  const month = bogotaNow.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

// Dia de hoy (YYYY-MM-DD) en hora de Colombia, para el "Gasto del dia".
function todayBogota(): string {
  const now = new Date();
  const bogotaNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${bogotaNow.getUTCFullYear()}-${pad(bogotaNow.getUTCMonth() + 1)}-${pad(bogotaNow.getUTCDate())}`;
}

export function ExpensesWorkspace({
  currency,
  metrics,
  expenses,
  categories,
  accounts,
  employees,
  embedded = false,
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

  // Rango de fechas: en modo standalone arranca en el mes en curso; embebido
  // (Balances) no filtra en cliente porque los datos ya vienen por periodo.
  const [fromDate, setFromDate] = React.useState(() => (embedded ? "" : currentMonthRange().from));
  const [toDate, setToDate] = React.useState(() => (embedded ? "" : currentMonthRange().to));
  // Filtro por categoria ("all" = todas). Afecta la tabla, el total del rango y
  // el panel "Gasto por categoria" para que todo sea coherente.
  const [categoryFilter, setCategoryFilter] = React.useState("all");

  const actionsReturnTo = "/admin/gastos";
  const categoryOptions = React.useMemo(
    () => categories.filter((category) => category.isActive).map((category) => ({ id: category.id, name: category.name })),
    [categories],
  );
  // Opciones del filtro: todas las categorias (incluidas inactivas) para poder
  // filtrar gastos historicos de una categoria ya desactivada.
  const categoryFilterOptions = React.useMemo(
    () => categories.map((category) => ({ id: category.id, name: category.name })),
    [categories],
  );

  // Gastos dentro del rango seleccionado (la fecha es un dia UTC) y de la
  // categoria filtrada.
  const filteredExpenses = React.useMemo(
    () =>
      expenses.filter((expense) => {
        const day = new Date(expense.expenseDate).toISOString().slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        if (categoryFilter !== "all" && expense.categoryId !== categoryFilter) return false;
        return true;
      }),
    [expenses, fromDate, toDate, categoryFilter],
  );

  // "Gasto por categoria" calculado desde los gastos ya filtrados, para que
  // refleje el mes en curso por defecto y cambie con el filtro de fechas.
  const categoryBreakdown = React.useMemo(() => {
    const totals = new Map<string, { categoryId: string; categoryName: string; totalAmount: number }>();
    for (const expense of filteredExpenses) {
      const current =
        totals.get(expense.categoryId) ??
        { categoryId: expense.categoryId, categoryName: expense.categoryName, totalAmount: 0 };
      current.totalAmount += expense.amount;
      totals.set(expense.categoryId, current);
    }
    return [...totals.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredExpenses]);

  const maxCategoryTotal = categoryBreakdown[0]?.totalAmount ?? 0;

  // Total del rango filtrado (tarjeta "Gasto del mes") y total de hoy.
  const rangeTotal = React.useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [filteredExpenses],
  );
  const todayTotal = React.useMemo(() => {
    const today = todayBogota();
    return expenses
      .filter((expense) => new Date(expense.expenseDate).toISOString().slice(0, 10) === today)
      .reduce((sum, expense) => sum + expense.amount, 0);
  }, [expenses]);

  return (
    <>
      <section className="space-y-4">
        {embedded ? null : (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
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
        )}

        <StatList
          items={[
            {
              label: "Gasto del mes",
              value: formatMoney(rangeTotal, currency),
              helper: `${filteredExpenses.length} gastos · rango seleccionado`,
              icon: ReceiptText,
              tone: "info",
            },
            {
              label: "Gasto del dia",
              value: formatMoney(todayTotal, currency),
              helper: "Hoy",
              icon: CalendarDays,
              tone: "danger",
            },
            {
              label: "Categoria principal",
              value: metrics.topCategoryName ?? "Sin datos",
              helper: metrics.topCategoryName ? formatMoney(metrics.topCategoryAmount, currency) : "Sin gastos aun",
              icon: Tags,
            },
            {
              label: "Categorias",
              value: `${metrics.categoryCount}`,
              helper: "Tipos de gasto definidos",
              icon: Tags,
            },
          ]}
        />

        {tab === "gastos" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(15rem,0.7fr)]">
            <ExpensesTable
              data={filteredExpenses}
              currency={currency}
              fromDate={fromDate}
              toDate={toDate}
              onDateChange={(range) => {
                setFromDate(range.from);
                setToDate(range.to);
              }}
              categories={categoryFilterOptions}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
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

            <Card className="border-border bg-card xl:self-start">
              <CardContent className="space-y-3 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Gasto por categoria</h3>
                  <p className="text-xs text-muted-foreground">Segun el rango de fechas seleccionado.</p>
                </div>
                <div className="space-y-2">
                  {categoryBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
                  ) : (
                    categoryBreakdown.map((item) => (
                      <div key={item.categoryId} className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.categoryName}</span>
                          <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-destructive">
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
        employees={employees}
        initialValue={
          expenseModal?.mode === "edit"
            ? {
                expenseId: expenseModal.initialValue.id,
                categoryId: expenseModal.initialValue.categoryId,
                accountId: expenseModal.initialValue.accountId,
                amount: expenseModal.initialValue.amount,
                description: expenseModal.initialValue.description,
                reference: expenseModal.initialValue.reference,
                receiptUrl: expenseModal.initialValue.receiptUrl,
                receiptName: expenseModal.initialValue.receiptName,
                employeeId: expenseModal.initialValue.employeeId,
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
