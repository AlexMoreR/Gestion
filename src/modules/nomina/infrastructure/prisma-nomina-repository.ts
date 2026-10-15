import { prisma } from "@/lib/prisma";
import type { DateRange } from "@/modules/balances/domain/entities";
import {
  belongsToPayrollMonth,
  isPayrollCategoryName,
  payrollMonthTag,
  parsePayrollConfig,
  type PayrollConfig,
  type PayrollPayment,
  type PayrollStaffMember,
} from "../domain/payroll";

// La configuracion de nomina (salarios, TRM, dias trabajados) vive en AppSetting como JSON:
// no requiere migracion de base de datos. Los pagos son gastos de la categoria "Nomina".
const PAYROLL_SETTING_KEY = "payrollConfig";

export type NominaRepository = {
  getConfig(): Promise<PayrollConfig>;
  saveConfig(config: PayrollConfig): Promise<void>;
  listStaff(): Promise<PayrollStaffMember[]>;
  listPayments(period: DateRange, month: string): Promise<PayrollPayment[]>;
  ensurePayrollCategory(createdById: string): Promise<string>;
};

export function createPrismaNominaRepository(): NominaRepository {
  return {
    async getConfig() {
      const row = await prisma.appSetting.findUnique({ where: { key: PAYROLL_SETTING_KEY }, select: { value: true } });
      return parsePayrollConfig(row?.value);
    },

    async saveConfig(config) {
      const value = JSON.stringify(config);
      await prisma.appSetting.upsert({
        where: { key: PAYROLL_SETTING_KEY },
        create: { key: PAYROLL_SETTING_KEY, value },
        update: { value },
      });
    },

    async listStaff() {
      const users = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "EMPLEADO"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      });
      return users.map((user) => ({ id: user.id, name: user.name?.trim() || user.email }));
    },

    async listPayments(period, month) {
      const categories = await prisma.expenseCategory.findMany({ select: { id: true, name: true } });
      const payrollIds = categories.filter((category) => isPayrollCategoryName(category.name)).map((category) => category.id);
      if (payrollIds.length === 0) return [];
      const rows = await prisma.expense.findMany({
        where: {
          categoryId: { in: payrollIds },
          employeeId: { not: null },
          OR: [
            { expenseDate: { gte: period.from, lt: period.to } },
            { description: { contains: payrollMonthTag(month) } },
          ],
        },
        orderBy: { expenseDate: "asc" },
        select: {
          id: true,
          employeeId: true,
          amount: true,
          expenseDate: true,
          description: true,
          account: { select: { name: true } },
        },
      });
      return rows
        .filter((row) => belongsToPayrollMonth(row.description, row.expenseDate, month, period))
        .map((row) => ({
        id: row.id,
        employeeId: row.employeeId as string,
        amount: Number(row.amount),
        date: row.expenseDate,
        description: row.description,
        accountName: row.account.name,
      }));
    },

    async ensurePayrollCategory(createdById) {
      const categories = await prisma.expenseCategory.findMany({
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        select: { id: true, name: true },
      });
      const existing = categories.find((category) => isPayrollCategoryName(category.name));
      if (existing) return existing.id;
      const created = await prisma.expenseCategory.create({
        data: { name: "Nomina", createdById },
        select: { id: true },
      });
      return created.id;
    },
  };
}
