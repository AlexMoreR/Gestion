"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  createShippingCostUseCase,
  createSupplierPaymentUseCase,
  deleteShippingCostUseCase,
  deleteSupplierPaymentUseCase,
  updateShippingCostUseCase,
  updateSupplierPaymentUseCase,
} from "@/modules/balances/application/use-cases";
import {
  shippingCostCreateSchema,
  shippingCostUpdateSchema,
  supplierPaymentCreateSchema,
  supplierPaymentUpdateSchema,
} from "@/modules/balances/application/schemas";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";

const repository = createPrismaBalancesRepository();

function redirectWithError(returnTo: string, message: string): never {
  const query = new URLSearchParams({ error: message }).toString();
  redirect(`${returnTo}?${query}`);
}

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  return session.user.id;
}

function getReturnTo(formData: FormData, fallback = "/admin/balances"): string {
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

export async function adminCreateSupplierPaymentAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = supplierPaymentCreateSchema.safeParse({
    saleId: getStringField(formData, "saleId"),
    supplierId: getStringField(formData, "supplierId"),
    amount: getStringField(formData, "amount"),
    transactionReference: getStringField(formData, "transactionReference"),
    paymentDate: getStringField(formData, "paymentDate"),
    notes: getStringField(formData, "notes") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  await createSupplierPaymentUseCase(repository, {
    ...parsed.data,
    notes: parsed.data.notes ?? null,
    createdById,
  });

  revalidatePath("/admin/balances");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Pago registrado" }).toString()}`);
}

export async function adminUpdateSupplierPaymentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = supplierPaymentUpdateSchema.safeParse({
    paymentId: getStringField(formData, "paymentId"),
    saleId: getStringField(formData, "saleId"),
    supplierId: getStringField(formData, "supplierId"),
    amount: getStringField(formData, "amount"),
    transactionReference: getStringField(formData, "transactionReference"),
    paymentDate: getStringField(formData, "paymentDate"),
    notes: getStringField(formData, "notes") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  await updateSupplierPaymentUseCase(repository, parsed.data.paymentId, {
    saleId: parsed.data.saleId,
    supplierId: parsed.data.supplierId,
    amount: parsed.data.amount,
    transactionReference: parsed.data.transactionReference,
    paymentDate: parsed.data.paymentDate,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/admin/balances");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Pago actualizado" }).toString()}`);
}

export async function adminDeleteSupplierPaymentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const paymentId = getStringField(formData, "paymentId");

  if (!paymentId) {
    redirectWithError(returnTo, "Pago invalido");
  }

  await deleteSupplierPaymentUseCase(repository, paymentId);
  revalidatePath("/admin/balances");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Pago eliminado" }).toString()}`);
}

export async function adminCreateShippingCostAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = shippingCostCreateSchema.safeParse({
    saleId: getStringField(formData, "saleId"),
    shippingProvider: getStringField(formData, "shippingProvider"),
    amount: getStringField(formData, "amount"),
    transactionReference: getStringField(formData, "transactionReference"),
    paymentDate: getStringField(formData, "paymentDate"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  await createShippingCostUseCase(repository, {
    ...parsed.data,
    createdById,
  });

  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Costo de envio registrado" }).toString()}`);
}

export async function adminUpdateShippingCostAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = shippingCostUpdateSchema.safeParse({
    shippingCostId: getStringField(formData, "shippingCostId"),
    saleId: getStringField(formData, "saleId"),
    shippingProvider: getStringField(formData, "shippingProvider"),
    amount: getStringField(formData, "amount"),
    transactionReference: getStringField(formData, "transactionReference"),
    paymentDate: getStringField(formData, "paymentDate"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  await updateShippingCostUseCase(repository, parsed.data.shippingCostId, {
    saleId: parsed.data.saleId,
    shippingProvider: parsed.data.shippingProvider,
    amount: parsed.data.amount,
    transactionReference: parsed.data.transactionReference,
    paymentDate: parsed.data.paymentDate,
  });

  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Costo de envio actualizado" }).toString()}`);
}

export async function adminDeleteShippingCostAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const shippingCostId = getStringField(formData, "shippingCostId");

  if (!shippingCostId) {
    redirectWithError(returnTo, "Costo invalido");
  }

  await deleteShippingCostUseCase(repository, shippingCostId);
  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Costo eliminado" }).toString()}`);
}
