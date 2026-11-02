import { colombiaMonthKey } from "../../../lib/colombia-time";

// Gasto pagado con la cuenta "Aportes del dueño" (OWNER).
export type OwnerContributionExpense = {
  id: string;
  date: Date;
  amount: number;
  categoryName: string;
  note: string | null;
};

export type OwnerContributionMonth = {
  month: string; // AAAA-MM en hora de Colombia
  total: number;
  expenses: OwnerContributionExpense[];
};

// Suma de gastos por mes (no es un saldo): el mes más reciente primero y, dentro del mes, el gasto más reciente primero.
export function summarizeOwnerContributions(expenses: OwnerContributionExpense[]): OwnerContributionMonth[] {
  const byMonth = new Map<string, OwnerContributionMonth>();
  for (const expense of expenses) {
    const month = colombiaMonthKey(expense.date);
    const row = byMonth.get(month) ?? { month, total: 0, expenses: [] };
    row.total += expense.amount;
    row.expenses.push(expense);
    byMonth.set(month, row);
  }
  return [...byMonth.values()]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((row) => ({
      ...row,
      total: Math.round(row.total * 100) / 100,
      expenses: [...row.expenses].sort((a, b) => b.date.getTime() - a.date.getTime()),
    }));
}
