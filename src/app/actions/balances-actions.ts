"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createAccountMovementUseCase,
  createAccountUseCase,
  createShippingCostUseCase,
  createSupplierPaymentUseCase,
  deleteShippingCostUseCase,
  deleteSupplierPaymentUseCase,
  updateAccountUseCase,
  updateShippingCostUseCase,
  updateSupplierPaymentUseCase,
} from "@/modules/balances/application/use-cases";
import {
  accountCreateSchema,
  accountMovementCreateSchema,
  accountUpdateSchema,
  shippingCostCreateSchema,
  shippingCostUpdateSchema,
  supplierPaymentCreateSchema,
  supplierPaymentUpdateSchema,
  transactionDateUpdateSchema,
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

  // El id de la sesion (token JWT) puede apuntar a un usuario que ya no existe
  // (sesion vieja). Resolvemos un User real por id o por email; si no existe
  // ninguno, forzamos re-login para evitar errores de llave foranea.
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

const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_RECEIPT_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

function getReceiptExtension(file: File): string {
  const fromName = path.extname(file.name).toLowerCase();
  if (fromName) return fromName;
  if (file.type === "application/pdf") return ".pdf";
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return ".jpg";
}

async function getSupplierSalePending(
  saleId: string,
  supplierId: string,
): Promise<{ charged: number; paid: number; pending: number }> {
  const [charges, payments] = await Promise.all([
    prisma.supplierLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { saleId, supplierId, type: "CHARGE" },
    }),
    prisma.supplierLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { saleId, supplierId, type: "PAYMENT" },
    }),
  ]);
  const charged = Number(charges._sum.amount ?? 0);
  const paid = Number(payments._sum.amount ?? 0);
  return { charged, paid, pending: charged - paid };
}

// Consulta usada por el formulario para mostrar el saldo pendiente al proveedor.
export async function adminSupplierSalePendingAction(
  saleId: string,
  supplierId: string,
): Promise<{ charged: number; paid: number; pending: number }> {
  await requireAdminSession();
  if (!saleId || !supplierId) {
    return { charged: 0, paid: 0, pending: 0 };
  }
  return getSupplierSalePending(saleId, supplierId);
}

async function saveSupplierPaymentReceipt(file: File): Promise<{ url: string; name: string }> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("No se pudo leer el comprobante.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error("El comprobante supera el limite de 12 MB.");
  }
  const extension = getReceiptExtension(file);
  if (!ALLOWED_RECEIPT_MIME.has(file.type) && !ALLOWED_RECEIPT_EXT.has(extension)) {
    throw new Error("El comprobante no es compatible. Solo JPG, PNG, WEBP o PDF.");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "suppliers", "payments");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

  return { url: `/uploads/suppliers/payments/${fileName}`, name: file.name || fileName };
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
    accountId: getStringField(formData, "accountId") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  // Control: no permitir pagar mas de lo que se le debe al proveedor en esta venta.
  const balance = await getSupplierSalePending(parsed.data.saleId, parsed.data.supplierId);
  if (balance.charged > 0 && parsed.data.amount > balance.pending + 0.5) {
    redirectWithError(
      returnTo,
      `El pago supera el saldo pendiente al proveedor ($${balance.pending.toLocaleString("es-CO")}).`,
    );
  }

  // Control: evitar registrar dos veces el mismo abono (misma referencia).
  const duplicate = await prisma.supplierLedgerEntry.findFirst({
    where: {
      saleId: parsed.data.saleId,
      supplierId: parsed.data.supplierId,
      type: "PAYMENT",
      transactionReference: parsed.data.transactionReference,
    },
    select: { id: true },
  });
  if (duplicate) {
    redirectWithError(returnTo, "Ya existe un pago con esa referencia para este proveedor y venta.");
  }

  const receiptFile = formData.get("receipt");
  let receipt: { url: string; name: string } | null = null;
  if (receiptFile instanceof File && receiptFile.size > 0) {
    try {
      receipt = await saveSupplierPaymentReceipt(receiptFile);
    } catch (error) {
      redirectWithError(returnTo, error instanceof Error ? error.message : "Comprobante invalido");
    }
  }

  await createSupplierPaymentUseCase(repository, {
    ...parsed.data,
    notes: parsed.data.notes ?? null,
    receiptUrl: receipt?.url ?? null,
    receiptName: receipt?.name ?? null,
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
    accountId: getStringField(formData, "accountId") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  const receiptFile = formData.get("receipt");
  let receipt: { url: string; name: string } | null = null;
  if (receiptFile instanceof File && receiptFile.size > 0) {
    try {
      receipt = await saveSupplierPaymentReceipt(receiptFile);
    } catch (error) {
      redirectWithError(returnTo, error instanceof Error ? error.message : "Comprobante invalido");
    }
  }

  await updateSupplierPaymentUseCase(repository, parsed.data.paymentId, {
    saleId: parsed.data.saleId,
    supplierId: parsed.data.supplierId,
    amount: parsed.data.amount,
    transactionReference: parsed.data.transactionReference,
    paymentDate: parsed.data.paymentDate,
    notes: parsed.data.notes ?? null,
    accountId: parsed.data.accountId,
    // Solo reemplaza el comprobante si se subio uno nuevo.
    ...(receipt ? { receiptUrl: receipt.url, receiptName: receipt.name } : {}),
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
    accountId: getStringField(formData, "accountId") || undefined,
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
    accountId: getStringField(formData, "accountId") || undefined,
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
    accountId: parsed.data.accountId,
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

export async function adminCreateAccountAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = accountCreateSchema.safeParse({
    name: getStringField(formData, "name"),
    type: getStringField(formData, "type"),
    reference: getStringField(formData, "reference") || undefined,
    openingBalance: getStringField(formData, "openingBalance") || 0,
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  try {
    await createAccountUseCase(repository, {
      name: parsed.data.name,
      type: parsed.data.type,
      reference: parsed.data.reference ?? null,
      openingBalance: parsed.data.openingBalance,
      createdById,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirectWithError(returnTo, "Ya existe una cuenta con ese nombre");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirectWithError(returnTo, "Tu sesion expiro. Cierra sesion e ingresa de nuevo.");
    }
    throw error;
  }

  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Cuenta creada" }).toString()}`);
}

export async function adminUpdateAccountAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = accountUpdateSchema.safeParse({
    accountId: getStringField(formData, "accountId"),
    name: getStringField(formData, "name"),
    type: getStringField(formData, "type"),
    reference: getStringField(formData, "reference") || undefined,
    openingBalance: getStringField(formData, "openingBalance") || 0,
    isActive: getStringField(formData, "isActive") === "true",
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  try {
    await updateAccountUseCase(repository, parsed.data.accountId, {
      name: parsed.data.name,
      type: parsed.data.type,
      reference: parsed.data.reference ?? null,
      openingBalance: parsed.data.openingBalance,
      isActive: parsed.data.isActive,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirectWithError(returnTo, "Ya existe una cuenta con ese nombre");
    }
    throw error;
  }

  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Cuenta actualizada" }).toString()}`);
}

// Edita la fecha de una sola transaccion desde el detalle de la cuenta. A
// diferencia de editar la fecha en la orden (que arrastra la orden, sus items y
// todos sus pagos/fletes a la misma fecha), esto solo mueve el registro
// seleccionado. Se invoca directamente desde el cliente con argumentos simples.
export async function adminUpdateTransactionDateAction(
  transactionId: string,
  date: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdminSession();

  const parsed = transactionDateUpdateSchema.safeParse({ transactionId, date });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos invalidos" };
  }

  // El id llega como "tipo:idReal"; el id real puede contener ":" en teoria,
  // por eso reconstruimos todo lo que va despues del primer segmento.
  const separatorIndex = parsed.data.transactionId.indexOf(":");
  const kind = separatorIndex === -1 ? "" : parsed.data.transactionId.slice(0, separatorIndex);
  const id = separatorIndex === -1 ? "" : parsed.data.transactionId.slice(separatorIndex + 1);
  const newDate = parsed.data.date;
  if (!id) {
    return { ok: false, error: "Transaccion invalida" };
  }

  try {
    switch (kind) {
      case "sale-payment":
        await prisma.salePayment.update({ where: { id }, data: { paymentDate: newDate } });
        break;
      case "supplier-payment":
        await prisma.supplierLedgerEntry.update({ where: { id }, data: { paymentDate: newDate } });
        break;
      case "shipping":
        await prisma.shippingCost.update({ where: { id }, data: { paymentDate: newDate } });
        break;
      case "expense":
        await prisma.expense.update({ where: { id }, data: { expenseDate: newDate } });
        break;
      case "movement": {
        const movement = await prisma.accountMovement.findUnique({
          where: { id },
          select: { transferId: true },
        });
        if (!movement) {
          return { ok: false, error: "El movimiento ya no existe" };
        }
        // Un traslado son dos movimientos (entra/sale) enlazados por transferId:
        // se mueven juntos para no quedar en fechas distintas.
        if (movement.transferId) {
          await prisma.accountMovement.updateMany({
            where: { transferId: movement.transferId },
            data: { movementDate: newDate },
          });
        } else {
          await prisma.accountMovement.update({ where: { id }, data: { movementDate: newDate } });
        }
        break;
      }
      default:
        return { ok: false, error: "Tipo de transaccion no soportado" };
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, error: "La transaccion ya no existe" };
    }
    throw error;
  }

  // "layout" revalida tambien el detalle de cada cuenta (ruta anidada dinamica).
  revalidatePath("/admin/balances", "layout");
  revalidatePath("/admin/proveedores");
  return { ok: true };
}

export async function adminCreateAccountMovementAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = accountMovementCreateSchema.safeParse({
    accountId: getStringField(formData, "accountId"),
    type: getStringField(formData, "type"),
    amount: getStringField(formData, "amount"),
    note: getStringField(formData, "note") || undefined,
    movementDate: getStringField(formData, "movementDate"),
    toAccountId: getStringField(formData, "toAccountId") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  await createAccountMovementUseCase(repository, {
    accountId: parsed.data.accountId,
    type: parsed.data.type,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
    movementDate: parsed.data.movementDate,
    toAccountId: parsed.data.toAccountId,
    createdById,
  });

  revalidatePath("/admin/balances");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Movimiento registrado" }).toString()}`);
}
