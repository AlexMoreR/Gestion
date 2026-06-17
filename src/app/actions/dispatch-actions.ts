"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildDispatchCode, parseDispatchCodeNumber } from "@/lib/orders";

const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_RECEIPT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

const createDispatchSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  carrierSupplierId: z.string().trim().min(1, "Selecciona la transportadora"),
  shippingCost: z.coerce.number().nonnegative("Costo de envio invalido"),
  shippingMode: z.enum(["PAY_NOW", "PAY_LATER"]).default("PAY_LATER"),
  trackingNumber: z.string().trim().max(120, "Guia demasiado larga").optional(),
  shippingAddress: z.string().trim().max(250, "Direccion demasiado larga").optional(),
  notes: z.string().trim().max(4000, "Notas demasiado largas").optional(),
});

function getReceiptExtension(file: File): string {
  const fromName = path.extname(file.name).toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (file.type === "application/pdf") return ".pdf";
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return "";
}

async function saveShippingReceipt(
  file: File,
  orderId: string,
): Promise<{ url: string; name: string }> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("No se pudo leer el comprobante de envio.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error(`El comprobante ${file.name} supera el limite de 12 MB.`);
  }
  const extension = getReceiptExtension(file);
  if (!ALLOWED_RECEIPT_MIME_TYPES.has(file.type) && !ALLOWED_RECEIPT_EXTENSIONS.has(extension)) {
    throw new Error(`El comprobante ${file.name} no es compatible. Solo JPG, PNG, WEBP o PDF.`);
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "dispatches", "receipts");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${orderId}-${Date.now()}-${randomUUID()}${extension || ".pdf"}`;
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

  return {
    url: `/uploads/dispatches/receipts/${fileName}`,
    name: file.name || fileName,
  };
}

const updateDispatchStatusSchema = z.object({
  dispatchId: z.string().trim().min(1, "Despacho invalido"),
  status: z.enum(["PENDING", "PACKING", "SHIPPED", "DELIVERED", "RETURNED", "CANCELLED"]),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
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

function parseAllowedTransitions(status: string): string[] {
  switch (status) {
    case "PENDING":
      return ["PACKING", "CANCELLED"];
    case "PACKING":
      return ["SHIPPED", "CANCELLED"];
    case "SHIPPED":
      return ["DELIVERED", "RETURNED"];
    case "RETURNED":
      return ["PACKING", "CANCELLED"];
    case "DELIVERED":
    case "CANCELLED":
      return [];
    default:
      return [];
  }
}

async function getNextDispatchCode(tx: Prisma.TransactionClient): Promise<string> {
  const lastDispatch = await tx.dispatch.findFirst({
    select: { code: true },
    orderBy: { code: "desc" },
  });

  const baseCodeNumber = lastDispatch ? parseDispatchCodeNumber(lastDispatch.code) : 0;

  for (let offset = 0; offset < 30; offset += 1) {
    const code = buildDispatchCode(baseCodeNumber + 1 + offset);
    const existing = await tx.dispatch.findUnique({ where: { code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to allocate dispatch code");
}

export async function adminCreateDispatchAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/despachos");

  const parsed = createDispatchSchema.safeParse({
    orderId: formData.get("orderId"),
    carrierSupplierId: formData.get("carrierSupplierId"),
    shippingCost: formData.get("shippingCost") || 0,
    shippingMode: formData.get("shippingMode") || "PAY_LATER",
    trackingNumber: formData.get("trackingNumber") || undefined,
    shippingAddress: formData.get("shippingAddress") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+despacho+invalidos`);
  }

  const carrier = await prisma.supplier.findUnique({
    where: { id: parsed.data.carrierSupplierId },
    select: { id: true, name: true },
  });
  if (!carrier) {
    redirect(`${returnTo}?error=Transportadora+no+encontrada`);
  }

  const shippingReceiptFile = formData.get("shippingReceipt");
  const hasShippingReceipt = shippingReceiptFile instanceof File && shippingReceiptFile.size > 0;
  if (parsed.data.shippingMode === "PAY_NOW" && !hasShippingReceipt) {
    redirect(`${returnTo}?error=Sube+el+comprobante+del+envio+o+selecciona+pagar+luego`);
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: {
      items: {
        include: {
          photos: { select: { id: true } },
        },
      },
      dispatches: {
        where: {
          status: {
            in: ["PENDING", "PACKING", "SHIPPED"],
          },
        },
      },
    },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  if (order.status === "CANCELLED" || order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+acepta+despachos`);
  }

  if (order.dispatches.length > 0) {
    redirect(`${returnTo}?error=Ya+existe+un+despacho+activo+para+esta+orden`);
  }

  if (order.items.length === 0) {
    redirect(`${returnTo}?error=La+orden+no+tiene+items`);
  }

  const unconfirmedItem = order.items.find(
    (item) => !item.confirmedSupplierId || item.purchaseCost === null,
  );
  if (unconfirmedItem) {
    redirect(`${returnTo}?error=Confirma+el+proveedor+y+costo+de+todos+los+items+antes+de+despachar`);
  }

  const itemWithoutPhoto = order.items.find((item) => item.photos.length === 0);
  if (itemWithoutPhoto) {
    redirect(`${returnTo}?error=Sube+al+menos+una+foto+del+producto+terminado+por+cada+item`);
  }

  const itemWithoutPayment = order.items.find((item) => item.supplierPaymentStatus === null);
  if (itemWithoutPayment) {
    redirect(`${returnTo}?error=Registra+el+pago+al+proveedor+de+cada+item+antes+de+despachar`);
  }

  const shippingCost = parsed.data.shippingCost;

  try {
    let receipt: { url: string; name: string } | null = null;
    if (parsed.data.shippingMode === "PAY_NOW" && hasShippingReceipt) {
      receipt = await saveShippingReceipt(shippingReceiptFile, order.id);
    }

    await prisma.$transaction(async (tx) => {
      const code = await getNextDispatchCode(tx);
      const dispatch = await tx.dispatch.create({
        data: {
          code,
          orderId: order.id,
          status: "PACKING",
          carrierName: carrier.name,
          carrierSupplierId: carrier.id,
          shippingCost,
          shippingReceiptUrl: receipt?.url ?? null,
          shippingReceiptName: receipt?.name ?? null,
          trackingNumber: parsed.data.trackingNumber || null,
          shippingAddress: parsed.data.shippingAddress || null,
          notes: parsed.data.notes || null,
          createdById,
          items: {
            create: order.items.map((item) => ({
              orderItemId: item.id,
              quantity: item.quantity,
              notes: item.notes,
            })),
          },
        },
      });

      // Costo de envio: gasto de la venta.
      if (shippingCost > 0) {
        const shippingReference =
          receipt?.name ?? parsed.data.trackingNumber ?? `Despacho ${dispatch.code}`;

        // 1) Modulo balances: registra el envio como gasto de la venta.
        await tx.shippingCost.create({
          data: {
            saleId: order.saleId,
            shippingProvider: carrier.name,
            amount: shippingCost,
            transactionReference: shippingReference,
            paymentDate: new Date(),
            createdById,
          },
        });

        // 2) Cuenta corriente de la transportadora (proveedor).
        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: carrier.id,
            type: "CHARGE",
            amount: shippingCost,
            note: `Envio - Despacho ${dispatch.code} (Orden ${order.code})`,
            saleId: order.saleId,
            orderId: order.id,
            dispatchId: dispatch.id,
            createdById,
          },
        });

        if (parsed.data.shippingMode === "PAY_NOW") {
          await tx.supplierLedgerEntry.create({
            data: {
              supplierId: carrier.id,
              type: "PAYMENT",
              amount: shippingCost,
              note: `Pago envio - Despacho ${dispatch.code}`,
              saleId: order.saleId,
              orderId: order.id,
              dispatchId: dispatch.id,
              paymentDate: new Date(),
              receiptUrl: receipt?.url ?? null,
              receiptName: receipt?.name ?? null,
              createdById,
            },
          });
        }
      }

      if (order.status !== "READY_FOR_DISPATCH") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "READY_FOR_DISPATCH" },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "READY_FOR_DISPATCH",
            note: "Despacho en preparacion",
            changedById: createdById,
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to create dispatch:", error);
    redirect(`${returnTo}?error=No+se+pudo+crear+el+despacho`);
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${order.id}`);
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Despacho+creado`);
}

export async function adminUpdateDispatchStatusAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/despachos");

  const parsed = updateDispatchStatusSchema.safeParse({
    dispatchId: formData.get("dispatchId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+despacho+invalidos`);
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: parsed.data.dispatchId },
    include: { order: true },
  });

  if (!dispatch) {
    redirect(`${returnTo}?error=Despacho+no+encontrado`);
  }

  const allowedTransitions = parseAllowedTransitions(dispatch.status);
  if (!allowedTransitions.includes(parsed.data.status)) {
    redirect(`${returnTo}?error=Transicion+de+despacho+invalida`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.dispatch.update({
      where: { id: dispatch.id },
      data: {
        status: parsed.data.status,
        packedAt: parsed.data.status === "PACKING" ? new Date() : dispatch.packedAt,
        shippedAt: parsed.data.status === "SHIPPED" ? new Date() : dispatch.shippedAt,
        deliveredAt: parsed.data.status === "DELIVERED" ? new Date() : dispatch.deliveredAt,
      },
    });

    if (parsed.data.status === "SHIPPED") {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: "DISPATCHED" },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: dispatch.orderId,
          fromStatus: dispatch.order.status,
          toStatus: "DISPATCHED",
          note: parsed.data.note || "Pedido despachado",
          changedById,
        },
      });
    }

    if (parsed.data.status === "DELIVERED") {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: dispatch.orderId,
          fromStatus: dispatch.order.status,
          toStatus: "COMPLETED",
          note: parsed.data.note || "Pedido entregado",
          changedById,
        },
      });
    }
  });

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${dispatch.orderId}`);
  redirect(`${returnTo}?ok=Despacho+actualizado`);
}

