import type { ExpenseCategoryTotal, ExpenseMetrics, ExpenseRow } from "./entities";

export function summarizeExpenseMetrics(
  expenses: ExpenseRow[],
  categoryCount: number,
  monthStart: Date,
): ExpenseMetrics {
  const expenseCount = expenses.length;
  const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(expense.categoryName, (byCategory.get(expense.categoryName) ?? 0) + expense.amount);
  }

  let topCategoryName: string | null = null;
  let topCategoryAmount = 0;
  for (const [name, amount] of byCategory) {
    if (amount > topCategoryAmount) {
      topCategoryName = name;
      topCategoryAmount = amount;
    }
  }

  const currentMonthAmount = expenses
    .filter((expense) => expense.expenseDate >= monthStart)
    .reduce((sum, expense) => sum + expense.amount, 0);

  return {
    expenseCount,
    totalAmount,
    categoryCount,
    topCategoryName,
    topCategoryAmount,
    currentMonthAmount,
  };
}

export function summarizeCategoryTotals(expenses: ExpenseRow[]): ExpenseCategoryTotal[] {
  const map = new Map<string, ExpenseCategoryTotal>();
  for (const expense of expenses) {
    const current = map.get(expense.categoryId) ?? {
      categoryId: expense.categoryId,
      categoryName: expense.categoryName,
      expenseCount: 0,
      totalAmount: 0,
    };
    current.expenseCount += 1;
    current.totalAmount += expense.amount;
    map.set(expense.categoryId, current);
  }

  return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
}
