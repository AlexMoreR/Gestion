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
  DateRange,
  Expense,
  ExpenseCategory,
  ExpenseCategoryTotal,
  ExpenseCategoryWithUsage,
  ExpenseMetrics,
  ExpenseRow,
} from "../domain/entities";
import { ExpenseDraftUsedError, normalizeWord } from "../domain/expense-draft";
import { summarizeCategoryTotals, summarizeExpenseMetrics } from "../domain/calculations";
import { registrarRetroactivos } from "@/modules/retroactivos/infrastructure/registrar-retroactivo";

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
  receiptUrl: string | null;
  receiptName: string | null;
  employeeId: string | null;
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
    receiptUrl: row.receiptUrl,
    receiptName: row.receiptName,
    employeeId: row.employeeId,
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
  receiptUrl: true,
  receiptName: true,
  employeeId: true,
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
  // En UTC: las fechas de gasto se guardan como medianoche UTC, asi que el corte
  // de "mes en curso" debe usar el mismo huso para no desfasar el dia 1.
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
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

    async ensureCategoryByName(name: string, createdById: string): Promise<ExpenseCategory> {
      // Pocas categorias: se compara sin tildes ni mayusculas ("Nómina" = "Nomina") para no duplicar.
      const findByName = async () => {
        const all = (await prisma.expenseCategory.findMany({ select: categorySelect })) as CategorySelection[];
        return all.find((row) => normalizeWord(row.name) === normalizeWord(name)) ?? null;
      };
      const existing = await findByName();
      if (existing) {
        return mapCategory(existing as CategorySelection);
      }
      try {
        const created = (await prisma.expenseCategory.create({
          data: { name, createdById },
          select: categorySelect,
        })) as CategorySelection;
        return mapCategory(created);
      } catch (error) {
        // Dos llamadas a la vez: gana la primera, la otra la lee.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const winner = await findByName();
          if (winner) {
            return mapCategory(winner);
          }
        }
        throw error;
      }
    },

    async listExpenses(period?: DateRange): Promise<ExpenseRow[]> {
      const rows = (await prisma.expense.findMany({
        where: period ? { expenseDate: { gte: period.from, lt: period.to } } : undefined,
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        select: {
          ...expenseSelect,
          category: { select: { name: true } },
          account: { select: { name: true } },
          employee: { select: { name: true, email: true } },
        },
      })) as Array<
        ExpenseSelection & {
          category: { name: string };
          account: { name: string };
          employee: { name: string | null; email: string } | null;
        }
      >;

      return rows.map((row) => ({
        ...mapExpense(row),
        categoryName: row.category.name,
        accountName: row.account.name,
        employeeName: row.employee ? row.employee.name ?? row.employee.email : null,
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
      const row = await prisma.$transaction(async (tx) => {
        if (input.fromDraft) {
          // Candado de la fila del borrador: un doble envio espera aqui y luego lo ve GUARDADO.
          const locked = await tx.$queryRaw<Array<{ estado: string }>>`
            SELECT "estado"::text AS "estado" FROM "GastoBorrador" WHERE "id" = ${input.fromDraft.id} FOR UPDATE`;
          if (locked[0]?.estado !== "PENDIENTE") {
            throw new ExpenseDraftUsedError();
          }
        }
        const created = (await tx.expense.create({
          data: {
            categoryId: input.categoryId,
            accountId: input.accountId,
            amount: input.amount,
            description: input.description ?? null,
            reference: input.reference ?? null,
            receiptUrl: input.receiptUrl ?? null,
            receiptName: input.receiptName ?? null,
            employeeId: input.employeeId ?? null,
            expenseDate: input.expenseDate,
            createdById: input.createdById,
          },
          select: expenseSelect,
        })) as ExpenseSelection;
        if (input.retroactivo) {
          await registrarRetroactivos(tx, [
            { tipo: "GASTO", registroId: created.id, monto: input.amount, ...input.retroactivo },
          ]);
        }
        if (input.fromDraft) {
          await tx.gastoBorrador.update({
            where: { id: input.fromDraft.id },
            data: {
              estado: "GUARDADO",
              expenseId: created.id,
              ultimoMotivoRechazo: null,
              revision: (input.fromDraft.revision ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            },
          });
        }
        return created;
      });
      return mapExpense(row);
    },

    async updateExpense(expenseId: string, input: UpdateExpenseInput): Promise<Expense> {
      const row = await prisma.$transaction(async (tx) => {
        const updated = (await tx.expense.update({
          where: { id: expenseId },
          data: {
            categoryId: input.categoryId,
            accountId: input.accountId,
            amount: input.amount,
            description: input.description ?? null,
            reference: input.reference ?? null,
            employeeId: input.employeeId ?? null,
            expenseDate: input.expenseDate,
            // Solo se toca el comprobante si el caso de uso lo provee (subir o quitar).
            ...(input.receiptUrl !== undefined
              ? { receiptUrl: input.receiptUrl, receiptName: input.receiptName ?? null }
              : {}),
          },
          select: expenseSelect,
        })) as ExpenseSelection;
        if (input.retroactivo) {
          await registrarRetroactivos(tx, [
            { tipo: "GASTO", registroId: expenseId, monto: input.amount, ...input.retroactivo },
          ]);
        }
        return updated;
      });
      return mapExpense(row);
    },

    async deleteExpense(expenseId: string): Promise<void> {
      await prisma.expense.delete({ where: { id: expenseId } });
    },

    async getMetrics(period?: DateRange): Promise<ExpenseMetrics> {
      const [expenses, categoryCount] = await Promise.all([
        this.listExpenses(period),
        prisma.expenseCategory.count(),
      ]);
      // Con periodo, "del mes" se mide desde el inicio del rango filtrado.
      const monthStart = period?.from ?? startOfCurrentMonth(new Date());
      return summarizeExpenseMetrics(expenses, categoryCount, monthStart);
    },

    async listCategoryTotals(period?: DateRange): Promise<ExpenseCategoryTotal[]> {
      const expenses = await this.listExpenses(period);
      return summarizeCategoryTotals(expenses);
    },
  };
}
