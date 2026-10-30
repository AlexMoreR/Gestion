"use server";

import { hasAnyModuleAccess } from "@/lib/admin-module-access";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
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
import { esEdicionRetroactiva, exigirMotivoSiRetroactivo } from "@/modules/retroactivos/domain/retroactivo";
import { datosRegistroRetroactivo } from "@/modules/retroactivos/infrastructure/registrar-retroactivo";

const repository = createPrismaBalancesRepository();

function redirectWithError(returnTo: string, message: string): never {
  const query = new URLSearchParams({ error: message }).toString();
  redirect(`${returnTo}?${query}`);
}

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["balances"]))) {
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

  // Un flete pagado al despachar resta del saldo por su pago: darle cuenta propia lo restaria dos veces.
  if (parsed.data.accountId) {
    const linked = await prisma.shippingCost.findUnique({
      where: { id: parsed.data.shippingCostId },
      select: { supplierPaymentId: true },
    });
    if (linked?.supplierPaymentId) {
      redirectWithError(returnTo, "Este flete ya se pago al despachar: su cuenta es la del pago al transportador");
    }
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
  motivo?: string,
): Promise<{ ok: boolean; error?: string; needsMotivo?: boolean }> {
  const userId = await requireAdminSession();

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

  // Abonos y gastos: si el dia cambia a uno anterior a hoy (hora Colombia) es un registro
  // retroactivo. Se exige motivo y se registra en la misma transaccion.
  const retroactivoDe = async (
    tipo: "ABONO" | "GASTO",
    previous: { date: Date | null; amount: Prisma.Decimal } | null,
  ): Promise<{ error: { ok: false; error: string; needsMotivo?: boolean } } | { row: Prisma.RegistroRetroactivoUncheckedCreateInput | null }> => {
    if (!previous) return { error: { ok: false, error: "La transaccion ya no existe" } };
    const motivoCheck = exigirMotivoSiRetroactivo(esEdicionRetroactiva(date, previous.date), motivo);
    if (!motivoCheck.ok) return { error: { ok: false, error: motivoCheck.error, needsMotivo: true } };
    if (!motivoCheck.motivo) return { row: null };
    return {
      row: datosRegistroRetroactivo({
        tipo,
        registroId: id,
        fechaPuesta: date,
        usuarioId: userId,
        motivo: motivoCheck.motivo,
        monto: previous.amount,
      }),
    };
  };

  try {
    switch (kind) {
      case "sale-payment": {
        const previous = await prisma.salePayment.findUnique({
          where: { id },
          select: { paymentDate: true, createdAt: true, amount: true },
        });
        const retro = await retroactivoDe(
          "ABONO",
          previous ? { date: previous.paymentDate ?? previous.createdAt, amount: previous.amount } : null,
        );
        if ("error" in retro) return retro.error;
        await prisma.$transaction([
          prisma.salePayment.update({ where: { id }, data: { paymentDate: newDate } }),
          ...(retro.row ? [prisma.registroRetroactivo.create({ data: retro.row })] : []),
        ]);
        break;
      }
      case "supplier-payment":
        await prisma.supplierLedgerEntry.update({ where: { id }, data: { paymentDate: newDate } });
        break;
      case "shipping":
        await prisma.shippingCost.update({ where: { id }, data: { paymentDate: newDate } });
        break;
      case "expense": {
        const previous = await prisma.expense.findUnique({
          where: { id },
          select: { expenseDate: true, amount: true },
        });
        const retro = await retroactivoDe(
          "GASTO",
          previous ? { date: previous.expenseDate, amount: previous.amount } : null,
        );
        if ("error" in retro) return retro.error;
        await prisma.$transaction([
          prisma.expense.update({ where: { id }, data: { expenseDate: newDate } }),
          ...(retro.row ? [prisma.registroRetroactivo.create({ data: retro.row })] : []),
        ]);
        break;
      }
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

// --- Fletes viejos sin cuenta (/admin/balances/fletes-sin-cuenta) ---
// Los asigna una persona (el dueno o Ingrid), nunca el sistema. Solo se tocan fletes que siguen
// sin cuenta y sin pago enlazado, asi un doble envio no cambia nada.

const FREIGHT_PATH = "/admin/balances/fletes-sin-cuenta";
const FREIGHT_BULK_MAX = 300;

function revalidateFreight() {
  revalidatePath(FREIGHT_PATH);
  revalidatePath("/admin/balances");
  revalidatePath("/admin/comisiones/nomina");
}

// "Asignar cuenta": el flete pasa a restar del saldo de esa cuenta.
export async function adminAssignFreightAccountAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const ids = [
    ...new Set(
      formData
        .getAll("shippingCostIds")
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  ];
  if (ids.length === 0) {
    redirectWithError(FREIGHT_PATH, "Marca al menos un flete");
  }
  if (ids.length > FREIGHT_BULK_MAX) {
    redirectWithError(FREIGHT_PATH, "Demasiados fletes a la vez");
  }
  const accountId = getStringField(formData, "accountId").trim();
  const account = accountId
    ? await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, name: true, isActive: true } })
    : null;
  if (!account || !account.isActive) {
    redirectWithError(FREIGHT_PATH, "Elige la cuenta de donde salio la plata");
  }

  const pending = await prisma.shippingCost.findMany({
    where: { id: { in: ids }, accountId: null, supplierPaymentId: null },
    select: { id: true, amount: true, shippingProvider: true, sale: { select: { code: true } } },
  });
  if (pending.length === 0) {
    redirectWithError(FREIGHT_PATH, "Esos fletes ya tienen cuenta");
  }
  const updated = await prisma.shippingCost.updateMany({
    where: { id: { in: pending.map((row) => row.id) }, accountId: null, supplierPaymentId: null },
    data: { accountId: account.id },
  });

  for (const row of pending) {
    await logActivity({
      action: "UPDATE",
      entityType: "ACCOUNT",
      entityId: account.id,
      summary: `Asignó la cuenta ${account.name} al flete de ${row.shippingProvider} por $${Math.round(Number(row.amount)).toLocaleString("es-CO")} (venta ${row.sale.code})`,
    });
  }

  revalidateFreight();
  redirect(`${FREIGHT_PATH}?ok=${encodeURIComponent(`${updated.count} flete(s) con cuenta ${account.name}`)}`);
}

// "Ya esta pagado en Proveedores": enlaza el flete con ese pago. No cambia ningun saldo (el pago
// ya restaba); el flete solo sale del aviso.
export async function adminLinkFreightPaymentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const [shippingCostId = "", paymentId = ""] = getStringField(formData, "link").split("|");
  if (!shippingCostId || !paymentId) {
    redirectWithError(FREIGHT_PATH, "Pago invalido");
  }

  const [cost, payment] = await Promise.all([
    prisma.shippingCost.findUnique({
      where: { id: shippingCostId },
      select: { id: true, saleId: true, accountId: true, supplierPaymentId: true, shippingProvider: true, amount: true, sale: { select: { code: true } } },
    }),
    prisma.supplierLedgerEntry.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        type: true,
        saleId: true,
        accountId: true,
        amount: true,
        order: { select: { saleId: true } },
        account: { select: { name: true } },
        supplier: { select: { name: true } },
        _count: { select: { shippingCosts: true } },
      },
    }),
  ]);
  if (!cost || cost.accountId || cost.supplierPaymentId) {
    redirectWithError(FREIGHT_PATH, "Ese flete ya tiene cuenta");
  }
  const paymentSaleId = payment?.saleId ?? payment?.order?.saleId ?? null;
  if (
    !payment ||
    payment.type !== "PAYMENT" ||
    !payment.accountId ||
    paymentSaleId !== cost.saleId ||
    payment._count.shippingCosts > 0
  ) {
    redirectWithError(FREIGHT_PATH, "Ese pago no sirve para este flete (otra venta, sin cuenta o ya enlazado)");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // El mismo pago no puede cubrir dos fletes: se revisa otra vez dentro de la transaccion.
    const taken = await tx.shippingCost.count({ where: { supplierPaymentId: payment.id } });
    if (taken > 0) {
      return 0;
    }
    const result = await tx.shippingCost.updateMany({
      where: { id: cost.id, accountId: null, supplierPaymentId: null },
      data: { supplierPaymentId: payment.id },
    });
    return result.count;
  });
  if (updated === 0) {
    redirectWithError(FREIGHT_PATH, "Ese pago o ese flete ya estaban enlazados");
  }

  await logActivity({
    action: "UPDATE",
    entityType: "ACCOUNT",
    entityId: payment.accountId,
    summary: `Enlazó el flete de ${cost.shippingProvider} por $${Math.round(Number(cost.amount)).toLocaleString("es-CO")} (venta ${cost.sale.code}) con el pago a ${payment.supplier.name} desde ${payment.account?.name ?? "su cuenta"}`,
  });

  revalidateFreight();
  redirect(`${FREIGHT_PATH}?ok=${encodeURIComponent("Flete enlazado con su pago en Proveedores")}`);
}
