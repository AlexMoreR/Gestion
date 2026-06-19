"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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

const repository = createPrismaExpensesRepository();

function redirectWithError(returnTo: string, message: string): never {
  const query = new URLSearchParams({ error: message }).toString();
  redirect(`${returnTo}?${query}`);
}

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
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

  try {
    await createCategoryUseCase(repository, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      createdById,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirectWithError(returnTo, "Ya existe una categoria con ese nombre");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirectWithError(returnTo, "Tu sesion expiro. Cierra sesion e ingresa de nuevo.");
    }
    throw error;
  }

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

  try {
    await deleteCategoryUseCase(repository, categoryId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirectWithError(returnTo, "No se puede eliminar: la categoria tiene gastos asociados.");
    }
    throw error;
  }

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
    expenseDate: getStringField(formData, "expenseDate"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  try {
    await createExpenseUseCase(repository, {
      categoryId: parsed.data.categoryId,
      accountId: parsed.data.accountId,
      amount: parsed.data.amount,
      description: parsed.data.description ?? null,
      reference: parsed.data.reference ?? null,
      expenseDate: parsed.data.expenseDate,
      createdById,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirectWithError(returnTo, "Categoria o cuenta invalida.");
    }
    throw error;
  }

  revalidatePath("/admin/gastos");
  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Gasto registrado" }).toString()}`);
}

export async function adminUpdateExpenseAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = expenseUpdateSchema.safeParse({
    expenseId: getStringField(formData, "expenseId"),
    categoryId: getStringField(formData, "categoryId"),
    accountId: getStringField(formData, "accountId"),
    amount: getStringField(formData, "amount"),
    description: getStringField(formData, "description") || undefined,
    reference: getStringField(formData, "reference") || undefined,
    expenseDate: getStringField(formData, "expenseDate"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  await updateExpenseUseCase(repository, parsed.data.expenseId, {
    categoryId: parsed.data.categoryId,
    accountId: parsed.data.accountId,
    amount: parsed.data.amount,
    description: parsed.data.description ?? null,
    reference: parsed.data.reference ?? null,
    expenseDate: parsed.data.expenseDate,
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

  await deleteExpenseUseCase(repository, expenseId);
  revalidatePath("/admin/gastos");
  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Gasto eliminado" }).toString()}`);
}
