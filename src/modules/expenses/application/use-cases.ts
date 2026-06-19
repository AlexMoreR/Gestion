import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ExpensesRepository,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from "../domain/repository";

export async function listCategoriesUseCase(
  repository: ExpensesRepository,
  options?: { activeOnly?: boolean },
) {
  return repository.listCategories(options);
}

export async function createCategoryUseCase(
  repository: ExpensesRepository,
  input: CreateExpenseCategoryInput,
) {
  return repository.createCategory(input);
}

export async function updateCategoryUseCase(
  repository: ExpensesRepository,
  categoryId: string,
  input: UpdateExpenseCategoryInput,
) {
  return repository.updateCategory(categoryId, input);
}

export async function deleteCategoryUseCase(repository: ExpensesRepository, categoryId: string) {
  return repository.deleteCategory(categoryId);
}

export async function listExpensesUseCase(repository: ExpensesRepository) {
  return repository.listExpenses();
}

export async function createExpenseUseCase(repository: ExpensesRepository, input: CreateExpenseInput) {
  return repository.createExpense(input);
}

export async function updateExpenseUseCase(
  repository: ExpensesRepository,
  expenseId: string,
  input: UpdateExpenseInput,
) {
  return repository.updateExpense(expenseId, input);
}

export async function deleteExpenseUseCase(repository: ExpensesRepository, expenseId: string) {
  return repository.deleteExpense(expenseId);
}

export async function getMetricsUseCase(repository: ExpensesRepository) {
  return repository.getMetrics();
}

export async function listCategoryTotalsUseCase(repository: ExpensesRepository) {
  return repository.listCategoryTotals();
}
