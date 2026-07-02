"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildManualChargeCode, parseManualChargeCodeNumber } from "@/lib/orders";

// Siguiente código de cargo manual (MAN-00001...), a partir del mayor existente.
async function getNextManualChargeCode(): Promise<string> {
  const last = await prisma.supplierLedgerEntry.findFirst({
    where: { code: { startsWith: "MAN-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const seq = last?.code ? parseManualChargeCodeNumber(last.code) : 0;
  return buildManualChargeCode(seq + 1);
}

const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_RECEIPT_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

async function saveSupplierPaymentReceipt(file: File): Promise<{ url: string; name: string }> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("No se pudo leer el comprobante.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error("El comprobante supera el límite de 12 MB.");
  }
  const fromName = path.extname(file.name).toLowerCase();
  const extension =
    fromName ||
    (file.type === "application/pdf"
      ? ".pdf"
      : file.type === "image/png"
        ? ".png"
        : file.type === "image/webp"
          ? ".webp"
          : ".jpg");
  if (!ALLOWED_RECEIPT_MIME.has(file.type) && !ALLOWED_RECEIPT_EXT.has(extension)) {
    throw new Error("El comprobante no es compatible. Solo JPG, PNG, WEBP o PDF.");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "suppliers", "payments");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

  return { url: `/uploads/suppliers/payments/${fileName}`, name: file.name || fileName };
}

const createPaymentSchema = z.object({
  supplierId: z.string().trim().min(1, "Proveedor inválido"),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero"),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
  accountId: z.string().trim().min(1).optional(),
  paymentDate: z.coerce.date().optional(),
  orderId: z.string().trim().min(1).optional(),
});

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  return session.user.id;
}

function getReturnTo(formData: FormData, fallback: string): string {
  const raw = formData.get("returnTo");
  if (typeof raw !== "string") {
    return fallback;
  }

  const value = raw.trim();
  return value || fallback;
}

export async function adminCreateSupplierPaymentAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/proveedores");

  const parsed = createPaymentSchema.safeParse({
    supplierId: formData.get("supplierId"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
    accountId: formData.get("accountId") || undefined,
    paymentDate: formData.get("paymentDate") || undefined,
    orderId: formData.get("orderId") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Datos del abono inválidos")}`);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: parsed.data.supplierId },
    select: { id: true },
  });

  if (!supplier) {
    redirect(`${returnTo}?error=Proveedor+no+encontrado`);
  }

  let accountId: string | null = null;
  if (parsed.data.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: parsed.data.accountId, isActive: true },
      select: { id: true },
    });
    if (!account) {
      redirect(`${returnTo}?error=Cuenta+no+encontrada`);
    }
    accountId = account.id;
  }

  // Si el abono se dirige a una orden, lo atamos a esa orden + venta y
  // validamos que no supere el saldo pendiente de esa orden con el proveedor.
  let orderId: string | null = null;
  let saleId: string | null = null;
  if (parsed.data.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      select: { id: true, saleId: true },
    });
    if (!order) {
      redirect(`${returnTo}?error=Orden+no+encontrada`);
    }
    orderId = order.id;
    saleId = order.saleId;

    const [charges, payments] = await Promise.all([
      prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { orderId: order.id, supplierId: supplier.id, type: "CHARGE" },
      }),
      prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { orderId: order.id, supplierId: supplier.id, type: "PAYMENT" },
      }),
    ]);
    const pending = Number(charges._sum.amount ?? 0) - Number(payments._sum.amount ?? 0);
    if (pending > 0 && parsed.data.amount > pending + 0.5) {
      redirect(
        `${returnTo}?error=${encodeURIComponent(
          `El abono supera el saldo pendiente de esa orden ($${pending.toLocaleString("es-CO")})`,
        )}`,
      );
    }
  }

  const receiptFile = formData.get("receipt");
  if (!(receiptFile instanceof File) || receiptFile.size <= 0) {
    redirect(`${returnTo}?error=${encodeURIComponent("El comprobante es obligatorio")}`);
  }

  let receipt: { url: string; name: string } | null = null;
  try {
    receipt = await saveSupplierPaymentReceipt(receiptFile);
  } catch (error) {
    redirect(
      `${returnTo}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Comprobante inválido",
      )}`,
    );
  }

  await prisma.supplierLedgerEntry.create({
    data: {
      supplierId: supplier.id,
      type: "PAYMENT",
      amount: parsed.data.amount,
      note: parsed.data.note || null,
      accountId,
      orderId,
      saleId,
      receiptUrl: receipt?.url ?? null,
      receiptName: receipt?.name ?? null,
      paymentDate: parsed.data.paymentDate ?? new Date(),
      createdById,
    },
  });

  // Si el abono cubre el saldo de la orden con este proveedor, marcamos sus
  // productos como pagados (así el balance/orden reflejan el pago).
  if (orderId) {
    const [chargeAgg, payAgg] = await Promise.all([
      prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { orderId, supplierId: supplier.id, type: "CHARGE" },
      }),
      prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { orderId, supplierId: supplier.id, type: "PAYMENT" },
      }),
    ]);
    const pending = Number(chargeAgg._sum.amount ?? 0) - Number(payAgg._sum.amount ?? 0);
    if (pending <= 0.0001) {
      await prisma.orderItem.updateMany({
        where: { orderId, confirmedSupplierId: supplier.id },
        data: { supplierPaymentStatus: "PAID" },
      });
    }
  }

  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Abono+registrado`);
}

const createChargeSchema = z.object({
  supplierId: z.string().trim().min(1, "Proveedor inválido"),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero"),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
  paymentDate: z.coerce.date().optional(),
});

// Registra un cargo (deuda) manual al proveedor que no proviene de una orden,
// como un servicio o trabajo suelto (tapizado, reparación, etc.).
export async function adminCreateSupplierChargeAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/proveedores");

  const parsed = createChargeSchema.safeParse({
    supplierId: formData.get("supplierId"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
    paymentDate: formData.get("paymentDate") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Datos del cargo inválidos")}`);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: parsed.data.supplierId },
    select: { id: true },
  });

  if (!supplier) {
    redirect(`${returnTo}?error=Proveedor+no+encontrado`);
  }

  // El comprobante es opcional para un cargo manual (puede no existir todavía).
  let receipt: { url: string; name: string } | null = null;
  const receiptFile = formData.get("receipt");
  if (receiptFile instanceof File && receiptFile.size > 0) {
    try {
      receipt = await saveSupplierPaymentReceipt(receiptFile);
    } catch (error) {
      redirect(
        `${returnTo}?error=${encodeURIComponent(
          error instanceof Error ? error.message : "Comprobante inválido",
        )}`,
      );
    }
  }

  await prisma.supplierLedgerEntry.create({
    data: {
      supplierId: supplier.id,
      code: await getNextManualChargeCode(),
      type: "CHARGE",
      amount: parsed.data.amount,
      note: parsed.data.note || null,
      receiptUrl: receipt?.url ?? null,
      receiptName: receipt?.name ?? null,
      paymentDate: parsed.data.paymentDate ?? new Date(),
      createdById,
    },
  });

  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Cargo+registrado`);
}

export async function adminDeleteSupplierPaymentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/proveedores");

  const paymentId = formData.get("paymentId");
  if (typeof paymentId !== "string" || !paymentId.trim()) {
    redirect(`${returnTo}?error=${encodeURIComponent("Movimiento inválido")}`);
  }

  const entry = await prisma.supplierLedgerEntry.findUnique({
    where: { id: (paymentId as string).trim() },
    select: { id: true, type: true, supplierId: true, orderId: true },
  });
  if (!entry) {
    redirect(`${returnTo}?error=Movimiento+no+encontrado`);
  }
  // Se pueden eliminar abonos (pagos) y cargos manuales (sin orden ligada).
  // Los cargos generados por una orden no se pueden borrar aquí.
  if (entry.type === "CHARGE" && entry.orderId) {
    redirect(`${returnTo}?error=${encodeURIComponent("No se puede eliminar un cargo ligado a una orden")}`);
  }

  await prisma.supplierLedgerEntry.delete({ where: { id: entry.id } });

  // Si el abono estaba ligado a una orden y al eliminarlo queda saldo pendiente,
  // revertimos a "pendiente" los productos que se habían marcado pagados por este abono
  // (no los que tienen un pago propio a nivel de ítem).
  if (entry.orderId) {
    const [chargeAgg, payAgg] = await Promise.all([
      prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { orderId: entry.orderId, supplierId: entry.supplierId, type: "CHARGE" },
      }),
      prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { orderId: entry.orderId, supplierId: entry.supplierId, type: "PAYMENT" },
      }),
    ]);
    const pending = Number(chargeAgg._sum.amount ?? 0) - Number(payAgg._sum.amount ?? 0);
    if (pending > 0.0001) {
      const paidItems = await prisma.orderItem.findMany({
        where: { orderId: entry.orderId, confirmedSupplierId: entry.supplierId, supplierPaymentStatus: "PAID" },
        select: { id: true },
      });
      const itemIds = paidItems.map((item) => item.id);
      if (itemIds.length > 0) {
        const itemLevelPaid = await prisma.supplierLedgerEntry.findMany({
          where: { type: "PAYMENT", orderItemId: { in: itemIds } },
          select: { orderItemId: true },
        });
        const keep = new Set(itemLevelPaid.map((e) => e.orderItemId));
        const toRevert = itemIds.filter((id) => !keep.has(id));
        if (toRevert.length > 0) {
          await prisma.orderItem.updateMany({
            where: { id: { in: toRevert } },
            data: { supplierPaymentStatus: "PENDING" },
          });
        }
      }
    }
  }

  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Abono+eliminado`);
}

// Registra un pago grande repartido en varias órdenes (o abono general).
export async function adminCreateSupplierPaymentsAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/proveedores");

  const supplierId = formData.get("supplierId");
  if (typeof supplierId !== "string" || !supplierId.trim()) {
    redirect(`${returnTo}?error=${encodeURIComponent("Proveedor inválido")}`);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: (supplierId as string).trim() },
    select: { id: true },
  });
  if (!supplier) {
    redirect(`${returnTo}?error=Proveedor+no+encontrado`);
  }

  // Líneas: targets[] + amounts[] en el mismo orden. target = "" (abono general)
  // | "order:<id>" | "charge:<id>".
  const rawTargets = formData.getAll("targets").map((value) => String(value).trim());
  const rawAmounts = formData.getAll("amounts").map((value) => Number(String(value).replace(/\D/g, "")));
  const allocations = rawTargets
    .map((target, index) => ({ target, amount: rawAmounts[index] ?? 0 }))
    .filter((line) => Number.isFinite(line.amount) && line.amount > 0);

  if (allocations.length === 0) {
    redirect(`${returnTo}?error=${encodeURIComponent("Agrega al menos una línea con monto")}`);
  }

  const usedTargets = new Set<string>();
  for (const line of allocations) {
    if (!line.target) continue;
    if (usedTargets.has(line.target)) {
      redirect(`${returnTo}?error=${encodeURIComponent("No repitas la misma orden o cargo en el abono")}`);
    }
    usedTargets.add(line.target);
  }

  let accountId: string | null = null;
  const rawAccountId = formData.get("accountId");
  if (typeof rawAccountId === "string" && rawAccountId.trim()) {
    const account = await prisma.account.findFirst({
      where: { id: rawAccountId.trim(), isActive: true },
      select: { id: true },
    });
    if (!account) {
      redirect(`${returnTo}?error=Cuenta+no+encontrada`);
    }
    accountId = account.id;
  }
  if (!accountId) {
    redirect(`${returnTo}?error=${encodeURIComponent("Selecciona la cuenta desde donde sale el dinero")}`);
  }

  const note = typeof formData.get("note") === "string" ? String(formData.get("note")).trim() : "";
  const rawDate = formData.get("paymentDate");
  const paymentDate = typeof rawDate === "string" && rawDate ? new Date(rawDate) : new Date();

  const receiptFile = formData.get("receipt");
  if (!(receiptFile instanceof File) || receiptFile.size <= 0) {
    redirect(`${returnTo}?error=${encodeURIComponent("El comprobante es obligatorio")}`);
  }

  let receipt: { url: string; name: string } | null = null;
  try {
    receipt = await saveSupplierPaymentReceipt(receiptFile as File);
  } catch (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Comprobante inválido")}`);
  }

  type PreparedAllocation = {
    amount: number;
    orderId: string | null;
    saleId: string | null;
    settlesEntryId: string | null;
  };

  const preparedAllocations: PreparedAllocation[] = [];

  for (const line of allocations) {
    let orderId: string | null = null;
    let saleId: string | null = null;
    let settlesEntryId: string | null = null;

    if (!line.target) {
      preparedAllocations.push({ amount: line.amount, orderId, saleId, settlesEntryId });
      continue;
    }

    if (line.target.startsWith("order:")) {
      const order = await prisma.order.findUnique({
        where: { id: line.target.slice("order:".length) },
        select: { id: true, code: true, saleId: true },
      });
      if (!order) {
        redirect(`${returnTo}?error=${encodeURIComponent("La orden seleccionada ya no existe")}`);
      }
      orderId = order.id;
      saleId = order.saleId;

      const [charges, payments] = await Promise.all([
        prisma.supplierLedgerEntry.aggregate({
          _sum: { amount: true },
          where: { orderId: order.id, supplierId: supplier.id, type: "CHARGE" },
        }),
        prisma.supplierLedgerEntry.aggregate({
          _sum: { amount: true },
          where: { orderId: order.id, supplierId: supplier.id, type: "PAYMENT" },
        }),
      ]);
      const pending = Number(charges._sum.amount ?? 0) - Number(payments._sum.amount ?? 0);
      if (pending <= 0.0001) {
        redirect(`${returnTo}?error=${encodeURIComponent(`La orden ${order.code} ya no tiene saldo pendiente`)}`);
      }
      if (line.amount > pending + 0.5) {
        redirect(
          `${returnTo}?error=${encodeURIComponent(
            `El abono para ${order.code} supera el saldo pendiente (${pending.toLocaleString("es-CO")})`,
          )}`,
        );
      }
    } else if (line.target.startsWith("charge:")) {
      // Abono que salda un cargo de inventario/manual específico.
      const charge = await prisma.supplierLedgerEntry.findFirst({
        where: { id: line.target.slice("charge:".length), supplierId: supplier.id, type: "CHARGE" },
        select: { id: true, amount: true, code: true, note: true, orderId: true, inventoryMovementId: true },
      });
      if (!charge || charge.orderId) {
        redirect(`${returnTo}?error=${encodeURIComponent("El cargo seleccionado ya no está disponible")}`);
      }
      settlesEntryId = charge.id;

      const paid = await prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { supplierId: supplier.id, type: "PAYMENT", settlesEntryId: charge.id },
      });
      const pending = Number(charge.amount) - Number(paid._sum.amount ?? 0);
      const label =
        charge.code ??
        (charge.inventoryMovementId || charge.note?.startsWith("Compra inventario") ? "Inventario" : "Cargo manual");

      if (pending <= 0.0001) {
        redirect(`${returnTo}?error=${encodeURIComponent(`${label} ya no tiene saldo pendiente`)}`);
      }
      if (line.amount > pending + 0.5) {
        redirect(
          `${returnTo}?error=${encodeURIComponent(
            `El abono para ${label} supera el saldo pendiente (${pending.toLocaleString("es-CO")})`,
          )}`,
        );
      }
    } else {
      redirect(`${returnTo}?error=${encodeURIComponent("Selecciona una orden o cargo válido")}`);
    }

    preparedAllocations.push({ amount: line.amount, orderId, saleId, settlesEntryId });
  }

  const affectedOrderIds = new Set<string>();

  for (const line of preparedAllocations) {
    await prisma.supplierLedgerEntry.create({
      data: {
        supplierId: supplier.id,
        type: "PAYMENT",
        amount: line.amount,
        note: note || null,
        accountId,
        orderId: line.orderId,
        saleId: line.saleId,
        settlesEntryId: line.settlesEntryId,
        receiptUrl: receipt?.url ?? null,
        receiptName: receipt?.name ?? null,
        paymentDate,
        createdById,
      },
    });

    if (line.orderId) {
      affectedOrderIds.add(line.orderId);
    }
  }

  for (const orderId of affectedOrderIds) {
    const [chargeAgg, payAgg] = await Promise.all([
      prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { orderId, supplierId: supplier.id, type: "CHARGE" },
      }),
      prisma.supplierLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { orderId, supplierId: supplier.id, type: "PAYMENT" },
      }),
    ]);
    const pending = Number(chargeAgg._sum.amount ?? 0) - Number(payAgg._sum.amount ?? 0);
    if (pending <= 0.0001) {
      await prisma.orderItem.updateMany({
        where: { orderId, confirmedSupplierId: supplier.id },
        data: { supplierPaymentStatus: "PAID" },
      });
    }
  }

  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Abono+registrado`);
}
