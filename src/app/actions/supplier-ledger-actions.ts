"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_RECEIPT_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

async function saveSupplierPaymentReceipt(file: File): Promise<{ url: string; name: string }> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("No se pudo leer el comprobante.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error("El comprobante supera el limite de 12 MB.");
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
  supplierId: z.string().trim().min(1, "Proveedor invalido"),
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
    redirect(`${returnTo}?error=Datos+del+abono+invalidos`);
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
        error instanceof Error ? error.message : "Comprobante invalido",
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
  // productos como pagados (asi el balance/orden reflejan el pago).
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

export async function adminDeleteSupplierPaymentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/proveedores");

  const paymentId = formData.get("paymentId");
  if (typeof paymentId !== "string" || !paymentId.trim()) {
    redirect(`${returnTo}?error=Movimiento+invalido`);
  }

  const entry = await prisma.supplierLedgerEntry.findUnique({
    where: { id: (paymentId as string).trim() },
    select: { id: true, type: true, supplierId: true, orderId: true },
  });
  if (!entry) {
    redirect(`${returnTo}?error=Movimiento+no+encontrado`);
  }
  // Solo se pueden eliminar abonos (pagos), nunca los cargos.
  if (entry.type !== "PAYMENT") {
    redirect(`${returnTo}?error=${encodeURIComponent("Solo se pueden eliminar abonos, no cargos")}`);
  }

  await prisma.supplierLedgerEntry.delete({ where: { id: entry.id } });

  // Si el abono estaba ligado a una orden y al eliminarlo queda saldo pendiente,
  // revertimos a "pendiente" los productos que se habian marcado pagados por este abono
  // (no los que tienen un pago propio a nivel de item).
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

// Registra un pago grande repartido en varias ordenes (o abono general).
export async function adminCreateSupplierPaymentsAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/proveedores");

  const supplierId = formData.get("supplierId");
  if (typeof supplierId !== "string" || !supplierId.trim()) {
    redirect(`${returnTo}?error=Proveedor+invalido`);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: (supplierId as string).trim() },
    select: { id: true },
  });
  if (!supplier) {
    redirect(`${returnTo}?error=Proveedor+no+encontrado`);
  }

  // Lineas: orderIds[] + amounts[] en el mismo orden.
  const rawOrderIds = formData.getAll("orderIds").map((value) => String(value).trim());
  const rawAmounts = formData.getAll("amounts").map((value) => Number(String(value).replace(/\D/g, "")));
  const allocations = rawOrderIds
    .map((orderId, index) => ({ orderId, amount: rawAmounts[index] ?? 0 }))
    .filter((line) => Number.isFinite(line.amount) && line.amount > 0);

  if (allocations.length === 0) {
    redirect(`${returnTo}?error=${encodeURIComponent("Agrega al menos una orden con monto")}`);
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
    redirect(`${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : "Comprobante invalido")}`);
  }

  for (const line of allocations) {
    let orderId: string | null = null;
    let saleId: string | null = null;
    if (line.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: line.orderId },
        select: { id: true, saleId: true },
      });
      if (order) {
        orderId = order.id;
        saleId = order.saleId;
      }
    }

    await prisma.supplierLedgerEntry.create({
      data: {
        supplierId: supplier.id,
        type: "PAYMENT",
        amount: line.amount,
        note: note || null,
        accountId,
        orderId,
        saleId,
        receiptUrl: receipt?.url ?? null,
        receiptName: receipt?.name ?? null,
        paymentDate,
        createdById,
      },
    });

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
  }

  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Abono+registrado`);
}
