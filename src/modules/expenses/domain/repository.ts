import type {
  Expense,
  ExpenseCategory,
  ExpenseCategoryTotal,
  ExpenseCategoryWithUsage,
  ExpenseMetrics,
  ExpenseRow,
} from "./entities";

export type CreateExpenseCategoryInput = {
  name: string;
  description?: string | null;
  createdById: string;
};

export type UpdateExpenseCategoryInput = {
  name: string;
  description?: string | null;
  isActive: boolean;
};

export type CreateExpenseInput = {
  categoryId: string;
  accountId: string;
  amount: number;
  description?: string | null;
  reference?: string | null;
  expenseDate: Date;
  createdById: string;
};

export type UpdateExpenseInput = Omit<CreateExpenseInput, "createdById">;

export interface ExpensesRepository {
  listCategories(options?: { activeOnly?: boolean }): Promise<ExpenseCategoryWithUsage[]>;
  createCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategory>;
  updateCategory(categoryId: string, input: UpdateExpenseCategoryInput): Promise<ExpenseCategory>;
  deleteCategory(categoryId: string): Promise<void>;
  ensureDefaultCategories(createdById: string): Promise<void>;

  listExpenses(): Promise<ExpenseRow[]>;
  getExpense(expenseId: string): Promise<Expense | null>;
  createExpense(input: CreateExpenseInput): Promise<Expense>;
  updateExpense(expenseId: string, input: UpdateExpenseInput): Promise<Expense>;
  deleteExpense(expenseId: string): Promise<void>;

  getMetrics(): Promise<ExpenseMetrics>;
  listCategoryTotals(): Promise<ExpenseCategoryTotal[]>;
}
