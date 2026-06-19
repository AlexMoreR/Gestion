import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  ExpensesRepository,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from "../domain/repository";
import type {
  Expense,
  ExpenseCategory,
  ExpenseCategoryTotal,
  ExpenseCategoryWithUsage,
  ExpenseMetrics,
  ExpenseRow,
} from "../domain/entities";
import { summarizeCategoryTotals, summarizeExpenseMetrics } from "../domain/calculations";

const DEFAULT_CATEGORIES = ["Nomina", "Marketing", "Varios"] as const;

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "number" ? value : Number(value);
}

type CategorySelection = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
};

function mapCategory(row: CategorySelection): ExpenseCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

type ExpenseSelection = {
  id: string;
  categoryId: string;
  accountId: string;
  amount: Prisma.Decimal;
  description: string | null;
  reference: string | null;
  expenseDate: Date;
  createdAt: Date;
};

function mapExpense(row: ExpenseSelection): Expense {
  return {
    id: row.id,
    categoryId: row.categoryId,
    accountId: row.accountId,
    amount: toNumber(row.amount),
    description: row.description,
    reference: row.reference,
    expenseDate: row.expenseDate,
    createdAt: row.createdAt,
  };
}

const expenseSelect = {
  id: true,
  categoryId: true,
  accountId: true,
  amount: true,
  description: true,
  reference: true,
  expenseDate: true,
  createdAt: true,
} satisfies Prisma.ExpenseSelect;

const categorySelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.ExpenseCategorySelect;

function startOfCurrentMonth(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth(), 1);
}

export function createPrismaExpensesRepository(): ExpensesRepository {
  return {
    async listCategories(options): Promise<ExpenseCategoryWithUsage[]> {
      const [categories, totals] = await Promise.all([
        prisma.expenseCategory.findMany({
          where: options?.activeOnly ? { isActive: true } : undefined,
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          select: categorySelect,
        }) as unknown as CategorySelection[],
        prisma.expense.groupBy({
          by: ["categoryId"],
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

      const usageMap = new Map<string, { count: number; total: number }>();
      for (const row of totals) {
        usageMap.set(row.categoryId, {
          count: row._count._all,
          total: toNumber(row._sum.amount),
        });
      }

      return categories.map((category) => {
        const usage = usageMap.get(category.id);
        return {
          ...mapCategory(category),
          expenseCount: usage?.count ?? 0,
          totalAmount: usage?.total ?? 0,
        };
      });
    },

    async createCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategory> {
      const row = (await prisma.expenseCategory.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          createdById: input.createdById,
        },
        select: categorySelect,
      })) as CategorySelection;
      return mapCategory(row);
    },

    async updateCategory(categoryId: string, input: UpdateExpenseCategoryInput): Promise<ExpenseCategory> {
      const row = (await prisma.expenseCategory.update({
        where: { id: categoryId },
        data: {
          name: input.name,
          description: input.description ?? null,
          isActive: input.isActive,
        },
        select: categorySelect,
      })) as CategorySelection;
      return mapCategory(row);
    },

    async deleteCategory(categoryId: string): Promise<void> {
      await prisma.expenseCategory.delete({ where: { id: categoryId } });
    },

    async ensureDefaultCategories(createdById: string): Promise<void> {
      const existing = await prisma.expenseCategory.count();
      if (existing > 0) {
        return;
      }
      await prisma.expenseCategory.createMany({
        data: DEFAULT_CATEGORIES.map((name) => ({ name, createdById })),
        skipDuplicates: true,
      });
    },

    async listExpenses(): Promise<ExpenseRow[]> {
      const rows = (await prisma.expense.findMany({
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        select: {
          ...expenseSelect,
          category: { select: { name: true } },
          account: { select: { name: true } },
        },
      })) as Array<ExpenseSelection & { category: { name: string }; account: { name: string } }>;

      return rows.map((row) => ({
        ...mapExpense(row),
        categoryName: row.category.name,
        accountName: row.account.name,
      }));
    },

    async getExpense(expenseId: string): Promise<Expense | null> {
      const row = (await prisma.expense.findUnique({
        where: { id: expenseId },
        select: expenseSelect,
      })) as ExpenseSelection | null;
      return row ? mapExpense(row) : null;
    },

    async createExpense(input: CreateExpenseInput): Promise<Expense> {
      const row = (await prisma.expense.create({
        data: {
          categoryId: input.categoryId,
          accountId: input.accountId,
          amount: input.amount,
          description: input.description ?? null,
          reference: input.reference ?? null,
          expenseDate: input.expenseDate,
          createdById: input.createdById,
        },
        select: expenseSelect,
      })) as ExpenseSelection;
      return mapExpense(row);
    },

    async updateExpense(expenseId: string, input: UpdateExpenseInput): Promise<Expense> {
      const row = (await prisma.expense.update({
        where: { id: expenseId },
        data: {
          categoryId: input.categoryId,
          accountId: input.accountId,
          amount: input.amount,
          description: input.description ?? null,
          reference: input.reference ?? null,
          expenseDate: input.expenseDate,
        },
        select: expenseSelect,
      })) as ExpenseSelection;
      return mapExpense(row);
    },

    async deleteExpense(expenseId: string): Promise<void> {
      await prisma.expense.delete({ where: { id: expenseId } });
    },

    async getMetrics(): Promise<ExpenseMetrics> {
      const [expenses, categoryCount] = await Promise.all([
        this.listExpenses(),
        prisma.expenseCategory.count(),
      ]);
      const monthStart = startOfCurrentMonth(new Date());
      return summarizeExpenseMetrics(expenses, categoryCount, monthStart);
    },

    async listCategoryTotals(): Promise<ExpenseCategoryTotal[]> {
      const expenses = await this.listExpenses();
      return summarizeCategoryTotals(expenses);
    },
  };
}
