"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildProductionJobCode, parseProductionJobCodeNumber } from "@/lib/orders";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";

const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_RECEIPT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

const confirmOrderItemSchema = z.object({
  orderItemId: z.string().trim().min(1, "Item invalido"),
  supplierId: z.string().trim().min(1, "Proveedor invalido"),
  purchaseCost: z.coerce.number().nonnegative("Costo invalido"),
});

const deletePhotoSchema = z.object({
  photoId: z.string().trim().min(1, "Foto invalida"),
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

function getPhotoExtension(file: File): string {
  const fromName = path.extname(file.name).toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return "";
}

function validatePhotoFile(file: File): string | null {
  if (!(file instanceof File) || file.size <= 0) {
    return "No se pudo leer una de las fotos.";
  }

  if (file.size > PHOTO_MAX_BYTES) {
    return `La foto ${file.name} supera el limite de 12 MB.`;
  }

  const extension = getPhotoExtension(file);
  const hasAllowedMime = ALLOWED_PHOTO_MIME_TYPES.has(file.type);
  const hasAllowedExtension = ALLOWED_PHOTO_EXTENSIONS.has(extension);

  if (!hasAllowedMime && !hasAllowedExtension) {
    return `La foto ${file.name} no es compatible. Solo se aceptan JPG, PNG o WEBP.`;
  }

  return null;
}

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

function validateReceiptFile(file: File): string | null {
  if (!(file instanceof File) || file.size <= 0) {
    return "No se pudo leer el recibo.";
  }

  if (file.size > RECEIPT_MAX_BYTES) {
    return `El recibo ${file.name} supera el limite de 12 MB.`;
  }

  const extension = getReceiptExtension(file);
  const hasAllowedMime = ALLOWED_RECEIPT_MIME_TYPES.has(file.type);
  const hasAllowedExtension = ALLOWED_RECEIPT_EXTENSIONS.has(extension);

  if (!hasAllowedMime && !hasAllowedExtension) {
    return `El recibo ${file.name} no es compatible. Solo se aceptan JPG, PNG, WEBP o PDF.`;
  }

  return null;
}

async function saveSupplierReceipt(
  file: File,
  orderItemId: string,
): Promise<{ url: string; name: string }> {
  const validationError = validateReceiptFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "suppliers", "receipts");
  await mkdir(uploadDir, { recursive: true });

  const extension = getReceiptExtension(file) || ".pdf";
  const fileName = `${orderItemId}-${Date.now()}-${randomUUID()}${extension}`;
  const filePath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(filePath, buffer);

  return {
    url: `/uploads/suppliers/receipts/${fileName}`,
    name: file.name || fileName,
  };
}

async function saveOrderItemPhoto(
  file: File,
  orderItemId: string,
  index: number,
): Promise<{ url: string; name: string }> {
  const validationError = validatePhotoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "orders", "items");
  await mkdir(uploadDir, { recursive: true });

  const extension = getPhotoExtension(file) || ".png";
  const fileName = `${orderItemId}-${String(index + 1).padStart(2, "0")}-${Date.now()}-${randomUUID()}${extension}`;
  const filePath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(filePath, buffer);

  return {
    url: `/uploads/orders/items/${fileName}`,
    name: file.name || fileName,
  };
}

export async function adminConfirmOrderItemAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = confirmOrderItemSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
    supplierId: formData.get("supplierId"),
    purchaseCost: formData.get("purchaseCost"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+confirmacion+invalidos`);
  }

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: parsed.data.orderItemId },
    include: {
      order: { select: { id: true, status: true } },
      product: { select: { suppliers: { select: { supplierId: true } } } },
      productionJobs: { select: { id: true } },
    },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Item+no+encontrado`);
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  const supplierAllowed = orderItem.product.suppliers.some(
    (entry) => entry.supplierId === parsed.data.supplierId,
  );
  if (!supplierAllowed) {
    redirect(`${returnTo}?error=El+proveedor+no+pertenece+al+producto`);
  }

  const meta = parseQuoteItemMeta(orderItem.notes);
  const jobNotes = [meta.description, meta.color ? `Color: ${meta.color}` : ""]
    .filter(Boolean)
    .join(" - ");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: orderItem.id },
        data: {
          confirmedSupplierId: parsed.data.supplierId,
          purchaseCost: parsed.data.purchaseCost,
          confirmedAt: new Date(),
        },
      });

      // Al confirmar (Fabricar) se envia el item a produccion, una sola vez.
      if (orderItem.productionJobs.length === 0) {
        const lastJob = await tx.productionJob.findFirst({
          select: { code: true },
          orderBy: { code: "desc" },
        });
        const baseCodeNumber = lastJob ? parseProductionJobCodeNumber(lastJob.code) : 0;

        let code = "";
        for (let offset = 0; offset < 30; offset += 1) {
          const candidate = buildProductionJobCode(baseCodeNumber + 1 + offset);
          const exists = await tx.productionJob.findUnique({
            where: { code: candidate },
            select: { id: true },
          });
          if (!exists) {
            code = candidate;
            break;
          }
        }
        if (!code) {
          throw new Error("No se pudo asignar codigo de produccion");
        }

        await tx.productionJob.create({
          data: {
            code,
            orderId: orderItem.order.id,
            orderItemId: orderItem.id,
            status: "PENDING",
            quantity: orderItem.quantity,
            notes: jobNotes || null,
            createdById,
          },
        });

        if (orderItem.order.status === "DRAFT" || orderItem.order.status === "RELEASED") {
          await tx.order.update({
            where: { id: orderItem.order.id },
            data: { status: "IN_PRODUCTION" },
          });
          await tx.orderStatusHistory.create({
            data: {
              orderId: orderItem.order.id,
              fromStatus: orderItem.order.status,
              toStatus: "IN_PRODUCTION",
              note: "Item confirmado y enviado a produccion",
              changedById: createdById,
            },
          });
        }
      }
    });
  } catch (error) {
    console.error("Failed to confirm order item:", error);
    redirect(`${returnTo}?error=No+se+pudo+confirmar+el+item`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/produccion");
  revalidatePath(`/admin/ordenes/${orderItem.order.id}`);
  redirect(`${returnTo}?ok=Item+confirmado+y+enviado+a+produccion`);
}

export async function adminUploadOrderItemPhotosAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const orderItemId = formData.get("orderItemId");
  if (typeof orderItemId !== "string" || !orderItemId.trim()) {
    redirect(`${returnTo}?error=Item+invalido`);
  }

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId.trim() },
    select: { id: true, orderId: true, order: { select: { status: true } } },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Item+no+encontrado`);
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  const files = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    redirect(`${returnTo}?error=Selecciona+al+menos+una+foto`);
  }

  try {
    const saved = await Promise.all(
      files.map((file, index) => saveOrderItemPhoto(file, orderItem.id, index)),
    );

    await prisma.orderItemPhoto.createMany({
      data: saved.map((photo) => ({
        orderItemId: orderItem.id,
        url: photo.url,
        name: photo.name,
      })),
    });
  } catch (error) {
    console.error("Failed to upload order item photos:", error);
    const message = error instanceof Error ? error.message : "No se pudieron subir las fotos";
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderItem.orderId}`);
  redirect(`${returnTo}?ok=Fotos+subidas`);
}

export async function adminDispatchItemAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const orderItemId = formData.get("orderItemId");
  if (typeof orderItemId !== "string" || !orderItemId.trim()) {
    redirect(`${returnTo}?error=Item+invalido`);
  }

  const paymentModeRaw = formData.get("paymentMode");
  const paymentMode = paymentModeRaw === "PAY_NOW" ? "PAY_NOW" : "PAY_LATER";

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId.trim() },
    include: {
      order: { select: { id: true, code: true, status: true, saleId: true } },
      photos: { select: { id: true } },
    },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Item+no+encontrado`);
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  if (!orderItem.confirmedSupplierId || orderItem.purchaseCost === null) {
    redirect(`${returnTo}?error=Confirma+el+proveedor+y+costo+antes+de+despachar`);
  }

  const newPhotoFiles = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const totalPhotos = orderItem.photos.length + newPhotoFiles.length;
  if (totalPhotos === 0) {
    redirect(`${returnTo}?error=Sube+al+menos+una+foto+del+producto+terminado`);
  }

  const receiptFile = formData.get("receipt");
  const hasReceipt = receiptFile instanceof File && receiptFile.size > 0;
  if (paymentMode === "PAY_NOW" && !hasReceipt && !orderItem.supplierReceiptUrl) {
    redirect(`${returnTo}?error=Sube+el+recibo+de+pago+o+selecciona+pagar+luego`);
  }

  const amount = Number(orderItem.purchaseCost) * orderItem.quantity;
  const supplierId = orderItem.confirmedSupplierId;
  const alreadyPaid = orderItem.supplierPaymentStatus === "PAID";
  const alreadyCharged = orderItem.supplierPaymentStatus !== null;

  try {
    const savedPhotos = await Promise.all(
      newPhotoFiles.map((file, index) => saveOrderItemPhoto(file, orderItem.id, index)),
    );

    let receipt: { url: string; name: string } | null = null;
    if (paymentMode === "PAY_NOW" && hasReceipt) {
      receipt = await saveSupplierReceipt(receiptFile, orderItem.id);
    }

    await prisma.$transaction(async (tx) => {
      if (savedPhotos.length > 0) {
        await tx.orderItemPhoto.createMany({
          data: savedPhotos.map((photo) => ({
            orderItemId: orderItem.id,
            url: photo.url,
            name: photo.name,
          })),
        });
      }

      // Genera el cargo (saldo) al proveedor una sola vez por item.
      if (!alreadyCharged && amount > 0) {
        await tx.supplierLedgerEntry.create({
          data: {
            supplierId,
            type: "CHARGE",
            amount,
            note: `Despacho item - Orden ${orderItem.order.code}`,
            saleId: orderItem.order.saleId,
            orderId: orderItem.order.id,
            orderItemId: orderItem.id,
            createdById,
          },
        });
      }

      if (paymentMode === "PAY_NOW") {
        if (!alreadyPaid && amount > 0) {
          await tx.supplierLedgerEntry.create({
            data: {
              supplierId,
              type: "PAYMENT",
              amount,
              note: `Pago a proveedor - Orden ${orderItem.order.code}`,
              saleId: orderItem.order.saleId,
              orderId: orderItem.order.id,
              orderItemId: orderItem.id,
              paymentDate: new Date(),
              receiptUrl: receipt?.url ?? orderItem.supplierReceiptUrl ?? null,
              receiptName: receipt?.name ?? orderItem.supplierReceiptName ?? null,
              createdById,
            },
          });
        }

        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: {
            supplierPaymentStatus: "PAID",
            supplierReceiptUrl: receipt?.url ?? orderItem.supplierReceiptUrl ?? null,
            supplierReceiptName: receipt?.name ?? orderItem.supplierReceiptName ?? null,
          },
        });
      } else if (!alreadyPaid) {
        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: { supplierPaymentStatus: "PENDING" },
        });
      }
    });
  } catch (error) {
    console.error("Failed to dispatch order item:", error);
    const message = error instanceof Error ? error.message : "No se pudo despachar el item";
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderItem.order.id}`);
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Item+listo+para+despacho`);
}

export async function adminDeleteOrderItemPhotoAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = deletePhotoSchema.safeParse({
    photoId: formData.get("photoId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Foto+invalida`);
  }

  const photo = await prisma.orderItemPhoto.findUnique({
    where: { id: parsed.data.photoId },
    select: { id: true, orderItem: { select: { orderId: true, order: { select: { status: true } } } } },
  });

  if (!photo) {
    redirect(`${returnTo}?error=Foto+no+encontrada`);
  }

  if (photo.orderItem.order.status === "CANCELLED" || photo.orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  await prisma.orderItemPhoto.delete({ where: { id: photo.id } });

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${photo.orderItem.orderId}`);
  redirect(`${returnTo}?ok=Foto+eliminada`);
}
