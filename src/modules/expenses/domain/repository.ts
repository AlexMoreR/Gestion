import type {
  DateRange,
  Expense,
  ExpenseCategory,
  ExpenseCategoryTotal,
  ExpenseCategoryWithUsage,
  ExpenseMetrics,
  ExpenseRow,
} from "./entities";
import type { ExpenseDraftStatus } from "./expense-draft";
import type { ReceiptAccountType } from "./receipt-check";

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
  receiptUrl?: string | null;
  receiptName?: string | null;
  employeeId?: string | null;
  expenseDate: Date;
  createdById: string;
  // Si la fecha es de un dia anterior a hoy: se guarda el registro retroactivo en la misma
  // transaccion. fechaPuesta = dia AAAA-MM-DD que escribio el usuario.
  retroactivo?: ExpenseRetroactivoInput | null;
  // Gasto dicho a Claude: en la misma transaccion el borrador pasa a GUARDADO (y si ya estaba
  // usado, falla con ExpenseDraftUsedError y no se crea nada). `revision` = lo que dijo la IA de la foto.
  fromDraft?: { id: string; revision: unknown } | null;
};

export type ExpenseRetroactivoInput = {
  fechaPuesta: string;
  usuarioId: string;
  motivo: string;
};

export type UpdateExpenseInput = Omit<CreateExpenseInput, "createdById">;

export interface ExpensesRepository {
  listCategories(options?: { activeOnly?: boolean }): Promise<ExpenseCategoryWithUsage[]>;
  createCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategory>;
  updateCategory(categoryId: string, input: UpdateExpenseCategoryInput): Promise<ExpenseCategory>;
  deleteCategory(categoryId: string): Promise<void>;
  ensureDefaultCategories(createdById: string): Promise<void>;
  // Busca la categoria por nombre (sin importar mayusculas ni tildes) y la crea si no existe.
  ensureCategoryByName(name: string, createdById: string): Promise<ExpenseCategory>;

  // Con `period` limita los gastos al rango (por fecha de gasto); sin el, todo el historico.
  listExpenses(period?: DateRange): Promise<ExpenseRow[]>;
  getExpense(expenseId: string): Promise<Expense | null>;
  createExpense(input: CreateExpenseInput): Promise<Expense>;
  updateExpense(expenseId: string, input: UpdateExpenseInput): Promise<Expense>;
  deleteExpense(expenseId: string): Promise<void>;

  getMetrics(period?: DateRange): Promise<ExpenseMetrics>;
  listCategoryTotals(period?: DateRange): Promise<ExpenseCategoryTotal[]>;
}

// --- Gastos por voz/chat (MCP): borrador que espera la foto del soporte ---------------------

export type NewExpenseDraft = {
  tokenHash: string;
  categoryId: string;
  accountId: string;
  amount: number;
  expenseDate: Date;
  description: string | null;
  retroMotivo: string | null;
  employeeId: string | null;
  createdById: string;
  expiresAt: Date;
};

export type ExpenseDraftView = {
  id: string;
  status: ExpenseDraftStatus;
  attempts: number;
  amount: number;
  expenseDate: Date;
  description: string | null;
  retroMotivo: string | null;
  employeeId: string | null;
  categoryId: string;
  categoryName: string;
  accountId: string;
  accountName: string;
  accountType: ReceiptAccountType;
  createdById: string;
  createdByName: string;
  expiresAt: Date;
};

export interface ExpenseDraftRepository {
  create(input: NewExpenseDraft): Promise<{ id: string }>;
  findByTokenHash(tokenHash: string): Promise<ExpenseDraftView | null>;
  // Suma un intento fallido (con el motivo y lo que dijo la IA). Si llega al maximo, queda RECHAZADO.
  recordRejection(draftId: string, rejection: { reason: string; revision: unknown; maxAttempts: number }): Promise<void>;
  // Un borrador PENDIENTE cuyo enlace ya vencio pasa a VENCIDO.
  markExpired(draftId: string): Promise<void>;
}
