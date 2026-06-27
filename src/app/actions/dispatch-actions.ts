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
  deliveryType: z.enum(["COUNTER", "PICKUP", "SHIPPING"]).default("SHIPPING"),
  carrierSupplierId: z.string().trim().optional(),
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

const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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

async function saveDeliveryPhoto(
  file: File,
  orderId: string,
): Promise<{ url: string; name: string }> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("No se pudo leer la foto de entrega.");
  }
  if (file.size > PHOTO_MAX_BYTES) {
    throw new Error(`La foto ${file.name} supera el limite de 12 MB.`);
  }
  const extension = getPhotoExtension(file);
  if (!ALLOWED_PHOTO_MIME_TYPES.has(file.type) && !ALLOWED_PHOTO_EXTENSIONS.has(extension)) {
    throw new Error(`La foto ${file.name} no es compatible. Solo JPG, PNG o WEBP.`);
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "dispatches", "deliveries");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${orderId}-${Date.now()}-${randomUUID()}${extension || ".jpg"}`;
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

  return {
    url: `/uploads/dispatches/deliveries/${fileName}`,
    name: file.name || fileName,
  };
}

async function saveTrackingPhoto(
  file: File,
  orderId: string,
): Promise<{ url: string; name: string }> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("No se pudo leer la foto de la guia.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new Error(`La foto ${file.name} supera el limite de 12 MB.`);
  }
  const extension = getReceiptExtension(file);
  if (!ALLOWED_RECEIPT_MIME_TYPES.has(file.type) && !ALLOWED_RECEIPT_EXTENSIONS.has(extension)) {
    throw new Error(`La foto ${file.name} no es compatible. Solo JPG, PNG, WEBP o PDF.`);
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "dispatches", "tracking");
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${orderId}-${Date.now()}-${randomUUID()}${extension || ".jpg"}`;
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));

  return {
    url: `/uploads/dispatches/tracking/${fileName}`,
    name: file.name || fileName,
  };
}

function normalizeHandle(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/^@+/, "");
  return trimmed ? trimmed.slice(0, 120) : null;
}

const completeDeliverySchema = z.object({
  dispatchId: z.string().trim().min(1, "Despacho invalido"),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
});

export async function adminCompleteDeliveryAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/despachos");

  const parsed = completeDeliverySchema.safeParse({
    dispatchId: formData.get("dispatchId"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+entrega+invalidos`);
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: parsed.data.dispatchId },
    include: { order: true },
  });

  if (!dispatch) {
    redirect(`${returnTo}?error=Despacho+no+encontrado`);
  }

  if (dispatch.status === "DELIVERED") {
    redirect(`${returnTo}?error=La+entrega+ya+fue+registrada`);
  }
  if (dispatch.status === "CANCELLED" || dispatch.status === "RETURNED") {
    redirect(`${returnTo}?error=El+despacho+no+admite+entrega`);
  }

  const instagram = normalizeHandle(formData.get("instagram"));
  const tiktok = normalizeHandle(formData.get("tiktok"));

  const photoFile = formData.get("deliveryPhoto");
  const hasPhoto = photoFile instanceof File && photoFile.size > 0;

  try {
    let photo: { url: string; name: string } | null = null;
    if (hasPhoto) {
      photo = await saveDeliveryPhoto(photoFile, dispatch.orderId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.dispatch.update({
        where: { id: dispatch.id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          deliveryPhotoUrl: photo?.url ?? dispatch.deliveryPhotoUrl,
          deliveryPhotoName: photo?.name ?? dispatch.deliveryPhotoName,
        },
      });

      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: dispatch.orderId,
          fromStatus: dispatch.order.status,
          toStatus: "COMPLETED",
          note: parsed.data.note || "Pedido entregado al cliente",
          changedById,
        },
      });

      // Redes sociales: se guardan en la ficha del cliente (reutilizables para marketing).
      if ((instagram || tiktok) && dispatch.order.clientId) {
        await tx.user.update({
          where: { id: dispatch.order.clientId },
          data: {
            ...(instagram ? { instagram } : {}),
            ...(tiktok ? { tiktok } : {}),
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to complete delivery:", error);
    redirect(`${returnTo}?error=No+se+pudo+registrar+la+entrega`);
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${dispatch.orderId}`);
  redirect(`${returnTo}?ok=Entrega+registrada`);
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
    deliveryType: formData.get("deliveryType") || "SHIPPING",
    carrierSupplierId: formData.get("carrierSupplierId") || undefined,
    shippingCost: formData.get("shippingCost") || 0,
    shippingMode: formData.get("shippingMode") || "PAY_LATER",
    trackingNumber: formData.get("trackingNumber") || undefined,
    shippingAddress: formData.get("shippingAddress") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+despacho+invalidos`);
  }

  const isShipping = parsed.data.deliveryType === "SHIPPING";

  // La transportadora solo es obligatoria cuando hay envío a domicilio.
  let carrier: { id: string; name: string } | null = null;
  if (parsed.data.carrierSupplierId) {
    carrier = await prisma.supplier.findUnique({
      where: { id: parsed.data.carrierSupplierId },
      select: { id: true, name: true },
    });
    if (!carrier) {
      redirect(`${returnTo}?error=Transportadora+no+encontrada`);
    }
  }
  if (isShipping && !carrier) {
    redirect(`${returnTo}?error=Selecciona+la+transportadora+para+el+envio`);
  }

  const accountIdRaw = formData.get("accountId");
  const accountId = typeof accountIdRaw === "string" && accountIdRaw.trim() ? accountIdRaw.trim() : null;

  const shippingReceiptFile = formData.get("shippingReceipt");
  const hasShippingReceipt = shippingReceiptFile instanceof File && shippingReceiptFile.size > 0;
  if (isShipping && parsed.data.shippingMode === "PAY_NOW" && !hasShippingReceipt) {
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

  // En una compra los items ya vienen comprados (pueden no tener proveedor ni
  // foto); en una venta hay que confirmar proveedor/costo, foto y pago.
  const isPurchaseOrder = order.type === "PURCHASE";
  if (!isPurchaseOrder) {
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
  }

  const shippingCost = isShipping ? parsed.data.shippingCost : 0;

  try {
    let receipt: { url: string; name: string } | null = null;
    if (isShipping && parsed.data.shippingMode === "PAY_NOW" && hasShippingReceipt) {
      receipt = await saveShippingReceipt(shippingReceiptFile, order.id);
    }

    await prisma.$transaction(async (tx) => {
      const code = await getNextDispatchCode(tx);
      const dispatch = await tx.dispatch.create({
        data: {
          code,
          orderId: order.id,
          status: "PACKING",
          deliveryType: parsed.data.deliveryType,
          carrierName: carrier?.name ?? null,
          carrierSupplierId: carrier?.id ?? null,
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

      // Costo de envio: gasto de la venta (solo aplica a envíos con transportadora).
      if (carrier && shippingCost > 0) {
        const shippingReference =
          receipt?.name ?? parsed.data.trackingNumber ?? `Despacho ${dispatch.code}`;

        // 1) Modulo balances: registra el envio como gasto de la venta. Solo
        // aplica a ventas; una compra no es venta (no debe entrar a utilidades).
        if (order.type !== "PURCHASE" && order.saleId) {
          await tx.shippingCost.create({
            data: {
              saleId: order.saleId,
              shippingProvider: carrier.name,
              amount: shippingCost,
              transactionReference: shippingReference,
              paymentDate: new Date(),
              // La cuenta solo se asocia cuando se paga ahora (salida real de dinero).
              accountId: parsed.data.shippingMode === "PAY_NOW" ? accountId : null,
              createdById,
            },
          });
        }

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

      if (order.status !== "DISPATCHED") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "DISPATCHED" },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "DISPATCHED",
            note: `Despacho ${dispatch.code} creado`,
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

const dispatchOrderItemSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  orderItemId: z.string().trim().min(1, "Producto invalido"),
  deliveryType: z.enum(["COUNTER", "PICKUP", "SHIPPING"]).default("SHIPPING"),
  carrierSupplierId: z.string().trim().optional(),
  shippingCost: z.coerce.number().nonnegative("Costo de envio invalido"),
  shippingMode: z.enum(["PAY_NOW", "PAY_LATER"]).default("PAY_LATER"),
  trackingNumber: z.string().trim().max(120, "Guia demasiado larga").optional(),
  shippingAddress: z.string().trim().max(250, "Direccion demasiado larga").optional(),
  notes: z.string().trim().max(4000, "Notas demasiado largas").optional(),
});

// Despacho de UN producto de la orden con su propia transportadora. Permite
// despachos parciales (varios productos pueden salir con transportadoras
// distintas). La orden pasa a DISPATCHED solo cuando TODOS los items estan
// despachados.
export async function adminDispatchOrderItemAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/despachos");

  const parsed = dispatchOrderItemSchema.safeParse({
    orderId: formData.get("orderId"),
    orderItemId: formData.get("orderItemId"),
    deliveryType: formData.get("deliveryType") || "SHIPPING",
    carrierSupplierId: formData.get("carrierSupplierId") || undefined,
    shippingCost: formData.get("shippingCost") || 0,
    shippingMode: formData.get("shippingMode") || "PAY_LATER",
    trackingNumber: formData.get("trackingNumber") || undefined,
    shippingAddress: formData.get("shippingAddress") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+despacho+invalidos`);
  }

  const isShipping = parsed.data.deliveryType === "SHIPPING";

  let carrier: { id: string; name: string } | null = null;
  if (parsed.data.carrierSupplierId) {
    carrier = await prisma.supplier.findUnique({
      where: { id: parsed.data.carrierSupplierId },
      select: { id: true, name: true },
    });
    if (!carrier) {
      redirect(`${returnTo}?error=Transportadora+no+encontrada`);
    }
  }
  if (isShipping && !carrier) {
    redirect(`${returnTo}?error=Selecciona+la+transportadora+para+el+envio`);
  }

  const accountIdRaw = formData.get("accountId");
  const accountId = typeof accountIdRaw === "string" && accountIdRaw.trim() ? accountIdRaw.trim() : null;

  const shippingReceiptFile = formData.get("shippingReceipt");
  const hasShippingReceipt = shippingReceiptFile instanceof File && shippingReceiptFile.size > 0;
  if (isShipping && parsed.data.shippingMode === "PAY_NOW" && !hasShippingReceipt) {
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
    },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  if (order.status === "CANCELLED" || order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+acepta+despachos`);
  }

  const item = order.items.find((entry) => entry.id === parsed.data.orderItemId);
  if (!item) {
    redirect(`${returnTo}?error=Producto+no+encontrado+en+la+orden`);
  }

  // En una compra el item ya viene comprado: no exige proveedor, foto ni pago.
  const isPurchaseOrder = order.type === "PURCHASE";
  if (!isPurchaseOrder && (!item.confirmedSupplierId || item.purchaseCost === null)) {
    redirect(`${returnTo}?error=Confirma+el+proveedor+y+costo+del+producto+antes+de+despachar`);
  }
  if (!isPurchaseOrder && item.photos.length === 0) {
    redirect(`${returnTo}?error=Sube+al+menos+una+foto+del+producto+terminado`);
  }
  if (!isPurchaseOrder && item.supplierPaymentStatus === null) {
    redirect(`${returnTo}?error=Registra+el+pago+al+proveedor+antes+de+despachar`);
  }

  const alreadyDispatched = await prisma.dispatchItem.findFirst({
    where: {
      orderItemId: item.id,
      dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } },
    },
    select: { id: true },
  });
  if (alreadyDispatched) {
    redirect(`${returnTo}?error=Este+producto+ya+fue+despachado`);
  }

  const trackingPhotoFile = formData.get("trackingPhoto");
  const hasTrackingPhoto = trackingPhotoFile instanceof File && trackingPhotoFile.size > 0;

  const shippingCost = isShipping ? parsed.data.shippingCost : 0;

  try {
    let receipt: { url: string; name: string } | null = null;
    if (isShipping && parsed.data.shippingMode === "PAY_NOW" && hasShippingReceipt) {
      receipt = await saveShippingReceipt(shippingReceiptFile, order.id);
    }

    let trackingPhoto: { url: string; name: string } | null = null;
    if (isShipping && hasTrackingPhoto) {
      trackingPhoto = await saveTrackingPhoto(trackingPhotoFile, order.id);
    }

    await prisma.$transaction(async (tx) => {
      const code = await getNextDispatchCode(tx);
      const dispatch = await tx.dispatch.create({
        data: {
          code,
          orderId: order.id,
          status: "PACKING",
          deliveryType: parsed.data.deliveryType,
          carrierName: carrier?.name ?? null,
          carrierSupplierId: carrier?.id ?? null,
          shippingCost,
          shippingReceiptUrl: receipt?.url ?? null,
          shippingReceiptName: receipt?.name ?? null,
          trackingNumber: parsed.data.trackingNumber || null,
          trackingPhotoUrl: trackingPhoto?.url ?? null,
          trackingPhotoName: trackingPhoto?.name ?? null,
          shippingAddress: parsed.data.shippingAddress || null,
          notes: parsed.data.notes || null,
          createdById,
          items: {
            create: [
              {
                orderItemId: item.id,
                quantity: item.quantity,
                notes: item.notes,
              },
            ],
          },
        },
      });

      if (carrier && shippingCost > 0) {
        const shippingReference =
          receipt?.name ?? parsed.data.trackingNumber ?? `Despacho ${dispatch.code}`;

        if (order.type !== "PURCHASE" && order.saleId) {
          await tx.shippingCost.create({
            data: {
              saleId: order.saleId,
              shippingProvider: carrier.name,
              amount: shippingCost,
              transactionReference: shippingReference,
              paymentDate: new Date(),
              accountId: parsed.data.shippingMode === "PAY_NOW" ? accountId : null,
              createdById,
            },
          });
        }

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

      // La orden pasa a DISPATCHED solo cuando todos los productos estan despachados.
      const dispatchedCount = await tx.dispatchItem.count({
        where: {
          orderItem: { orderId: order.id },
          dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } },
        },
      });

      if (dispatchedCount >= order.items.length && order.status !== "DISPATCHED") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "DISPATCHED" },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "DISPATCHED",
            note: "Todos los productos despachados",
            changedById: createdById,
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to dispatch order item:", error);
    redirect(`${returnTo}?error=No+se+pudo+despachar+el+producto`);
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${order.id}`);
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Producto+despachado`);
}

function parseOrderItemIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }
  } catch {
    // ignore
  }
  return [];
}

const bulkDispatchSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  deliveryType: z.enum(["COUNTER", "PICKUP", "SHIPPING"]).default("SHIPPING"),
  carrierSupplierId: z.string().trim().optional(),
  shippingCost: z.coerce.number().nonnegative("Costo de envio invalido"),
  shippingAddress: z.string().trim().max(250, "Direccion demasiado larga").optional(),
  notes: z.string().trim().max(4000, "Notas demasiado largas").optional(),
});

// Despacha VARIOS productos en un solo despacho con la misma transportadora.
// La orden pasa a DISPATCHED solo cuando todos los productos estan despachados.
export async function adminBulkDispatchOrderItemsAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/despachos");

  const ids = parseOrderItemIds(formData.get("orderItemIds"));
  if (ids.length === 0) {
    redirect(`${returnTo}?error=Selecciona+al+menos+un+producto`);
  }

  const parsed = bulkDispatchSchema.safeParse({
    orderId: formData.get("orderId"),
    deliveryType: formData.get("deliveryType") || "SHIPPING",
    carrierSupplierId: formData.get("carrierSupplierId") || undefined,
    shippingCost: formData.get("shippingCost") || 0,
    shippingAddress: formData.get("shippingAddress") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+despacho+invalidos`);
  }

  const isShipping = parsed.data.deliveryType === "SHIPPING";

  let carrier: { id: string; name: string } | null = null;
  if (parsed.data.carrierSupplierId) {
    carrier = await prisma.supplier.findUnique({
      where: { id: parsed.data.carrierSupplierId },
      select: { id: true, name: true },
    });
    if (!carrier) {
      redirect(`${returnTo}?error=Transportadora+no+encontrada`);
    }
  }
  if (isShipping && !carrier) {
    redirect(`${returnTo}?error=Selecciona+la+transportadora+para+el+envio`);
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: {
      items: { include: { photos: { select: { id: true } } } },
    },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }
  if (order.status === "CANCELLED" || order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+acepta+despachos`);
  }

  const selectedItems = order.items.filter((item) => ids.includes(item.id));
  if (selectedItems.length === 0) {
    redirect(`${returnTo}?error=Productos+no+encontrados+en+la+orden`);
  }

  // En una compra los items ya vienen comprados: no exige proveedor, foto ni pago.
  const isPurchaseOrder = order.type === "PURCHASE";
  if (!isPurchaseOrder) {
    for (const item of selectedItems) {
      if (!item.confirmedSupplierId || item.purchaseCost === null) {
        redirect(`${returnTo}?error=Confirma+el+proveedor+y+costo+de+todos+los+productos+antes+de+despachar`);
      }
      if (item.photos.length === 0) {
        redirect(`${returnTo}?error=Sube+al+menos+una+foto+de+cada+producto+terminado`);
      }
      if (item.supplierPaymentStatus === null) {
        redirect(`${returnTo}?error=Registra+el+pago+al+proveedor+de+cada+producto+antes+de+despachar`);
      }
    }
  }

  const alreadyDispatched = await prisma.dispatchItem.findFirst({
    where: {
      orderItemId: { in: selectedItems.map((item) => item.id) },
      dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } },
    },
    select: { id: true },
  });
  if (alreadyDispatched) {
    redirect(`${returnTo}?error=Uno+de+los+productos+ya+fue+despachado`);
  }

  // Costo de envio por producto: el cliente envia un mapa orderItemId -> costo.
  // El total del despacho es la suma; cada DispatchItem guarda su porcion.
  const perItemCosts = new Map<string, number>();
  const rawItemCosts = formData.get("itemShippingCosts");
  if (typeof rawItemCosts === "string" && rawItemCosts.trim()) {
    try {
      const arr = JSON.parse(rawItemCosts) as unknown;
      if (Array.isArray(arr)) {
        for (const entry of arr) {
          if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { orderItemId?: unknown }).orderItemId === "string"
          ) {
            const id = (entry as { orderItemId: string }).orderItemId;
            const cost = Number((entry as { cost?: unknown }).cost ?? 0);
            perItemCosts.set(id, Number.isFinite(cost) && cost > 0 ? Math.round(cost) : 0);
          }
        }
      }
    } catch {
      // ignore, se usara el costo total plano
    }
  }

  const hasPerItemCosts = isShipping && perItemCosts.size > 0;
  const perItemTotal = selectedItems.reduce((sum, item) => sum + (perItemCosts.get(item.id) ?? 0), 0);
  const shippingCost = isShipping ? (hasPerItemCosts ? perItemTotal : parsed.data.shippingCost) : 0;

  const trackingPhotoFile = formData.get("trackingPhoto");
  const hasTrackingPhoto = trackingPhotoFile instanceof File && trackingPhotoFile.size > 0;

  try {
    let trackingPhoto: { url: string; name: string } | null = null;
    if (isShipping && hasTrackingPhoto) {
      trackingPhoto = await saveTrackingPhoto(trackingPhotoFile, order.id);
    }

    await prisma.$transaction(async (tx) => {
      const code = await getNextDispatchCode(tx);
      const dispatch = await tx.dispatch.create({
        data: {
          code,
          orderId: order.id,
          status: "PACKING",
          deliveryType: parsed.data.deliveryType,
          carrierName: carrier?.name ?? null,
          carrierSupplierId: carrier?.id ?? null,
          shippingCost,
          trackingPhotoUrl: trackingPhoto?.url ?? null,
          trackingPhotoName: trackingPhoto?.name ?? null,
          shippingAddress: parsed.data.shippingAddress || null,
          notes: parsed.data.notes || null,
          createdById,
          items: {
            create: selectedItems.map((item) => ({
              orderItemId: item.id,
              quantity: item.quantity,
              notes: item.notes,
              shippingCost: hasPerItemCosts ? perItemCosts.get(item.id) ?? 0 : 0,
            })),
          },
        },
      });

      if (carrier && shippingCost > 0) {
        const shippingReference = trackingPhoto?.name ?? `Despacho ${dispatch.code}`;
        if (order.type !== "PURCHASE" && order.saleId) {
          await tx.shippingCost.create({
            data: {
              saleId: order.saleId,
              shippingProvider: carrier.name,
              amount: shippingCost,
              transactionReference: shippingReference,
              paymentDate: new Date(),
              accountId: null,
              createdById,
            },
          });
        }
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
      }

      const dispatchedCount = await tx.dispatchItem.count({
        where: {
          orderItem: { orderId: order.id },
          dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } },
        },
      });

      if (dispatchedCount >= order.items.length && order.status !== "DISPATCHED") {
        await tx.order.update({ where: { id: order.id }, data: { status: "DISPATCHED" } });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "DISPATCHED",
            note: "Todos los productos despachados",
            changedById: createdById,
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to bulk dispatch order items:", error);
    redirect(`${returnTo}?error=No+se+pudo+despachar+los+productos`);
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${order.id}`);
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=${encodeURIComponent(`Despachados ${selectedItems.length} productos`)}`);
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

// Reparte el costo de envio del despacho entre sus productos. El total no cambia
// (es lo que se le paga a la transportadora); solo se distribuye por item.
export async function adminUpdateDispatchShippingCostsAction(input: {
  dispatchId: string;
  items: { id: string; shippingCost: number }[];
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdminSession();

  const dispatchId = input?.dispatchId?.trim();
  if (!dispatchId) {
    return { ok: false, error: "Despacho invalido" };
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    select: { id: true, shippingCost: true, items: { select: { id: true } } },
  });
  if (!dispatch) {
    return { ok: false, error: "Despacho no encontrado" };
  }

  const itemIds = new Set(dispatch.items.map((item) => item.id));
  const updates = (input.items ?? []).filter((item) => itemIds.has(item.id));
  for (const update of updates) {
    if (!Number.isFinite(update.shippingCost) || update.shippingCost < 0) {
      return { ok: false, error: "Monto invalido" };
    }
  }

  const total = Math.round(Number(dispatch.shippingCost ?? 0));
  const sum = updates.reduce((acc, update) => acc + Math.round(update.shippingCost), 0);
  if (total > 0 && Math.abs(sum - total) > 1) {
    return {
      ok: false,
      error: `La suma ($${sum.toLocaleString("es-CO")}) debe ser igual al total ($${total.toLocaleString("es-CO")}).`,
    };
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.dispatchItem.update({
        where: { id: update.id },
        data: { shippingCost: Math.round(update.shippingCost) },
      }),
    ),
  );

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/proveedores");
  return { ok: true };
}

