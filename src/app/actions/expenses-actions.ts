"use server";

import { hasAnyModuleAccess } from "@/lib/admin-module-access";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { getReceiptFile, saveExpenseReceipt } from "@/lib/expense-receipt";
import { prisma } from "@/lib/prisma";
import {
  createCategoryUseCase,
  createExpenseUseCase,
  deleteCategoryUseCase,
  deleteExpenseUseCase,
  updateCategoryUseCase,
  updateExpenseUseCase,
} from "@/modules/expenses/application/use-cases";
import {
  expenseCategoryCreateSchema,
  expenseCategoryUpdateSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
} from "@/modules/expenses/application/schemas";
import { createPrismaExpensesRepository } from "@/modules/expenses/infrastructure/prisma-expenses-repository";
import {
  MOTIVO_FIELD,
  esEdicionRetroactiva,
  esRetroactivo,
  exigirMotivoSiRetroactivo,
} from "@/modules/retroactivos/domain/retroactivo";

const repository = createPrismaExpensesRepository();

function redirectWithError(returnTo: string, message: string): never {
  const query = new URLSearchParams({ error: message }).toString();
  redirect(`${returnTo}?${query}`);
}

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["expenses"]))) {
    redirect("/unauthorized");
  }

  const byId = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (byId) {
    return byId.id;
  }

  if (session.user.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (byEmail) {
      return byEmail.id;
    }
  }

  redirect("/login");
}

function getReturnTo(formData: FormData, fallback = "/admin/gastos"): string {
  const raw = formData.get("returnTo");
  if (typeof raw !== "string") {
    return fallback;
  }
  const value = raw.trim();
  return value || fallback;
}

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// El comprobante es obligatorio salvo en cuentas de efectivo (Caja).
async function accountRequiresReceipt(accountId: string): Promise<boolean> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { type: true },
  });
  return account ? account.type !== "CASH" : false;
}

// Un gasto de Nomina exige indicar a que empleado corresponde.
async function categoryIsPayroll(categoryId: string): Promise<boolean> {
  const category = await prisma.expenseCategory.findUnique({
    where: { id: categoryId },
    select: { name: true },
  });
  return category ? /n[oó]mina/i.test(category.name) : false;
}

export async function adminCreateExpenseCategoryAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = expenseCategoryCreateSchema.safeParse({
    name: getStringField(formData, "name"),
    description: getStringField(formData, "description") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  let createdCategoryId: string | null = null;
  try {
    const createdCategory = await createCategoryUseCase(repository, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      createdById,
    });
    createdCategoryId = createdCategory.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirectWithError(returnTo, "Ya existe una categoria con ese nombre");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirectWithError(returnTo, "Tu sesion expiro. Cierra sesion e ingresa de nuevo.");
    }
    throw error;
  }

  await logActivity({
    action: "CREATE",
    entityType: "EXPENSE_CATEGORY",
    entityId: createdCategoryId,
    summary: `Creó la categoría de gasto "${parsed.data.name}"`,
  });

  revalidatePath("/admin/gastos");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Categoria creada" }).toString()}`);
}

export async function adminUpdateExpenseCategoryAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = expenseCategoryUpdateSchema.safeParse({
    categoryId: getStringField(formData, "categoryId"),
    name: getStringField(formData, "name"),
    description: getStringField(formData, "description") || undefined,
    isActive: getStringField(formData, "isActive") === "true",
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  try {
    await updateCategoryUseCase(repository, parsed.data.categoryId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirectWithError(returnTo, "Ya existe una categoria con ese nombre");
    }
    throw error;
  }

  await logActivity({
    action: "UPDATE",
    entityType: "EXPENSE_CATEGORY",
    entityId: parsed.data.categoryId,
    summary: `Actualizó la categoría de gasto "${parsed.data.name}"`,
  });

  revalidatePath("/admin/gastos");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Categoria actualizada" }).toString()}`);
}

export async function adminDeleteExpenseCategoryAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const categoryId = getStringField(formData, "categoryId");

  if (!categoryId) {
    redirectWithError(returnTo, "Categoria invalida");
  }

  const categoryToDelete = await prisma.expenseCategory.findUnique({
    where: { id: categoryId },
    select: { name: true },
  });

  try {
    await deleteCategoryUseCase(repository, categoryId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirectWithError(returnTo, "No se puede eliminar: la categoria tiene gastos asociados.");
    }
    throw error;
  }

  await logActivity({
    action: "DELETE",
    entityType: "EXPENSE_CATEGORY",
    entityId: categoryId,
    summary: categoryToDelete
      ? `Eliminó la categoría de gasto "${categoryToDelete.name}"`
      : `Eliminó la categoría de gasto ${categoryId}`,
  });

  revalidatePath("/admin/gastos");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Categoria eliminada" }).toString()}`);
}

export async function adminCreateExpenseAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = expenseCreateSchema.safeParse({
    categoryId: getStringField(formData, "categoryId"),
    accountId: getStringField(formData, "accountId"),
    amount: getStringField(formData, "amount"),
    description: getStringField(formData, "description") || undefined,
    reference: getStringField(formData, "reference") || undefined,
    employeeId: getStringField(formData, "employeeId") || undefined,
    expenseDate: getStringField(formData, "expenseDate"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  if (!parsed.data.employeeId && (await categoryIsPayroll(parsed.data.categoryId))) {
    redirectWithError(returnTo, "Selecciona el empleado para un gasto de nomina.");
  }

  // Retroactivo: gasto con fecha de un dia anterior a hoy (hora Colombia). Exige motivo.
  const expenseDateRaw = getStringField(formData, "expenseDate").trim();
  const motivoCheck = exigirMotivoSiRetroactivo(esRetroactivo(expenseDateRaw), formData.get(MOTIVO_FIELD));
  if (!motivoCheck.ok) {
    redirectWithError(returnTo, motivoCheck.error);
  }

  let receipt: { url: string; name: string } | null = null;
  const receiptFile = getReceiptFile(formData);
  if (receiptFile) {
    try {
      receipt = await saveExpenseReceipt(receiptFile);
    } catch (error) {
      redirectWithError(returnTo, error instanceof Error ? error.message : "Comprobante invalido");
    }
  }

  if (!receipt && (await accountRequiresReceipt(parsed.data.accountId))) {
    redirectWithError(returnTo, "El comprobante es obligatorio salvo en cuentas de efectivo.");
  }

  let createdExpenseId: string | null = null;
  try {
    const createdExpense = await createExpenseUseCase(repository, {
      categoryId: parsed.data.categoryId,
      accountId: parsed.data.accountId,
      amount: parsed.data.amount,
      description: parsed.data.description ?? null,
      reference: parsed.data.reference ?? null,
      receiptUrl: receipt?.url ?? null,
      receiptName: receipt?.name ?? null,
      employeeId: parsed.data.employeeId ?? null,
      expenseDate: parsed.data.expenseDate,
      createdById,
      retroactivo: motivoCheck.motivo
        ? { fechaPuesta: expenseDateRaw, usuarioId: createdById, motivo: motivoCheck.motivo }
        : null,
    });
    createdExpenseId = createdExpense.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirectWithError(returnTo, "Categoria o cuenta invalida.");
    }
    throw error;
  }

  await logActivity({
    action: "CREATE",
    entityType: "EXPENSE",
    entityId: createdExpenseId,
    summary: `Registró un gasto de $${Number(parsed.data.amount).toLocaleString("es-CO")}`,
  });

  revalidatePath("/admin/gastos");
  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Gasto registrado" }).toString()}`);
}

export async function adminUpdateExpenseAction(formData: FormData): Promise<void> {
  const userId = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = expenseUpdateSchema.safeParse({
    expenseId: getStringField(formData, "expenseId"),
    categoryId: getStringField(formData, "categoryId"),
    accountId: getStringField(formData, "accountId"),
    amount: getStringField(formData, "amount"),
    description: getStringField(formData, "description") || undefined,
    reference: getStringField(formData, "reference") || undefined,
    employeeId: getStringField(formData, "employeeId") || undefined,
    expenseDate: getStringField(formData, "expenseDate"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  if (!parsed.data.employeeId && (await categoryIsPayroll(parsed.data.categoryId))) {
    redirectWithError(returnTo, "Selecciona el empleado para un gasto de nomina.");
  }

  // Retroactivo: si la fecha cambia a un dia anterior a hoy (hora Colombia). Exige motivo.
  const existing = await repository.getExpense(parsed.data.expenseId);
  const expenseDateRaw = getStringField(formData, "expenseDate").trim();
  const motivoCheck = exigirMotivoSiRetroactivo(
    esEdicionRetroactiva(expenseDateRaw, existing?.expenseDate ?? null),
    formData.get(MOTIVO_FIELD),
  );
  if (!motivoCheck.ok) {
    redirectWithError(returnTo, motivoCheck.error);
  }

  // Comprobante: subir uno nuevo lo reemplaza; "removeReceipt" lo quita; si no, se conserva.
  let receiptUpdate: { receiptUrl?: string | null; receiptName?: string | null } = {};
  const receiptFile = getReceiptFile(formData);
  if (receiptFile) {
    try {
      const saved = await saveExpenseReceipt(receiptFile);
      receiptUpdate = { receiptUrl: saved.url, receiptName: saved.name };
    } catch (error) {
      redirectWithError(returnTo, error instanceof Error ? error.message : "Comprobante invalido");
    }
  } else if (getStringField(formData, "removeReceipt") === "true") {
    receiptUpdate = { receiptUrl: null, receiptName: null };
  }

  // Comprobante resultante tras aplicar el cambio (nuevo, quitado o el existente).
  const finalReceiptUrl =
    receiptUpdate.receiptUrl !== undefined ? receiptUpdate.receiptUrl : existing?.receiptUrl ?? null;
  if (!finalReceiptUrl && (await accountRequiresReceipt(parsed.data.accountId))) {
    redirectWithError(returnTo, "El comprobante es obligatorio salvo en cuentas de efectivo.");
  }

  await updateExpenseUseCase(repository, parsed.data.expenseId, {
    categoryId: parsed.data.categoryId,
    accountId: parsed.data.accountId,
    amount: parsed.data.amount,
    description: parsed.data.description ?? null,
    reference: parsed.data.reference ?? null,
    employeeId: parsed.data.employeeId ?? null,
    expenseDate: parsed.data.expenseDate,
    ...receiptUpdate,
    retroactivo: motivoCheck.motivo
      ? { fechaPuesta: expenseDateRaw, usuarioId: userId, motivo: motivoCheck.motivo }
      : null,
  });

  await logActivity({
    action: "UPDATE",
    entityType: "EXPENSE",
    entityId: parsed.data.expenseId,
    summary: `Actualizó un gasto de $${Number(parsed.data.amount).toLocaleString("es-CO")}`,
  });

  revalidatePath("/admin/gastos");
  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Gasto actualizado" }).toString()}`);
}

export async function adminDeleteExpenseAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const expenseId = getStringField(formData, "expenseId");

  if (!expenseId) {
    redirectWithError(returnTo, "Gasto invalido");
  }

  const expenseToDelete = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { amount: true },
  });

  await deleteExpenseUseCase(repository, expenseId);

  await logActivity({
    action: "DELETE",
    entityType: "EXPENSE",
    entityId: expenseId,
    summary: expenseToDelete
      ? `Eliminó un gasto de $${Number(expenseToDelete.amount).toLocaleString("es-CO")}`
      : `Eliminó el gasto ${expenseId}`,
  });

  revalidatePath("/admin/gastos");
  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Gasto eliminado" }).toString()}`);
}
