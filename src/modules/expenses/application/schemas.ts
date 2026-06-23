import { z } from "zod";

export const expenseCategoryCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120, "Nombre muy largo"),
  description: z.string().trim().max(500, "Descripcion demasiado larga").optional(),
});

export const expenseCategoryUpdateSchema = expenseCategoryCreateSchema.extend({
  categoryId: z.string().trim().min(1, "La categoria es obligatoria"),
  isActive: z.coerce.boolean().default(true),
});

export const expenseCreateSchema = z.object({
  categoryId: z.string().trim().min(1, "La categoria es obligatoria"),
  accountId: z.string().trim().min(1, "La cuenta es obligatoria"),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero"),
  description: z.string().trim().max(2000, "Descripcion demasiado larga").optional(),
  reference: z.string().trim().max(120, "Referencia muy larga").optional(),
  employeeId: z.string().trim().min(1).optional(),
  expenseDate: z.coerce.date(),
});

export const expenseUpdateSchema = expenseCreateSchema.extend({
  expenseId: z.string().trim().min(1, "El gasto es obligatorio"),
});

export type ExpenseCategoryFormValues = z.infer<typeof expenseCategoryCreateSchema>;
export type ExpenseFormValues = z.infer<typeof expenseCreateSchema>;
