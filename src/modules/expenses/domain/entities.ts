export type ExpenseCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type ExpenseCategoryWithUsage = ExpenseCategory & {
  expenseCount: number;
  totalAmount: number;
};

export type Expense = {
  id: string;
  categoryId: string;
  accountId: string;
  amount: number;
  description: string | null;
  reference: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
  employeeId: string | null;
  expenseDate: Date;
  createdAt: Date;
};

export type ExpenseRow = Expense & {
  categoryName: string;
  accountName: string;
  employeeName: string | null;
};

export type ExpenseMetrics = {
  expenseCount: number;
  totalAmount: number;
  categoryCount: number;
  topCategoryName: string | null;
  topCategoryAmount: number;
  currentMonthAmount: number;
};

export type ExpenseCategoryTotal = {
  categoryId: string;
  categoryName: string;
  expenseCount: number;
  totalAmount: number;
};

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
