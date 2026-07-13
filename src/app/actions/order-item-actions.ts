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
import { syncOrderStatusAfterProduction } from "@/app/actions/orders-actions";

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

const updateOrderItemFulfillmentSchema = z.object({
  orderItemId: z.string().trim().min(1, "Item invalido"),
  fulfillmentMode: z.enum(["STOCK", "MANUFACTURE"]),
});

// Cambia el modo (Stock/Fabricacion) de un producto de la orden. Solo actualiza
// la etiqueta; el ajuste de inventario se maneja aparte (durante el cuadre).
export async function adminUpdateOrderItemFulfillmentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = updateOrderItemFulfillmentSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
    fulfillmentMode: formData.get("fulfillmentMode"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+invalidos`);
  }

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: parsed.data.orderItemId },
    select: { id: true, orderId: true, fulfillmentMode: true, confirmedAt: true },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Producto+no+encontrado`);
  }

  // No se puede cambiar el modo de un item ya confirmado: el inventario (stock) o
  // el saldo/produccion (fabricacion) ya se movieron. Hay que deshacer primero.
  if (orderItem.confirmedAt !== null && orderItem.fulfillmentMode !== parsed.data.fulfillmentMode) {
    redirect(`${returnTo}?error=Deshaz+la+confirmacion+antes+de+cambiar+el+modo+del+producto`);
  }

  await prisma.orderItem.update({
    where: { id: orderItem.id },
    data: { fulfillmentMode: parsed.data.fulfillmentMode },
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderItem.orderId}`);
  redirect(`${returnTo}?ok=Modo+actualizado`);
}

// Edita en lote el modo (Stock/Fabricacion) de los productos de una orden, desde
// el modal "Editar orden". Solo cambia la etiqueta; no mueve inventario.
export async function adminUpdateOrderItemsFulfillmentAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const orderId = typeof formData.get("orderId") === "string" ? (formData.get("orderId") as string).trim() : "";
  const ids = formData.getAll("orderItemId").map((value) => String(value));
  const modes = formData.getAll("fulfillmentMode").map((value) => String(value));

  if (!orderId || ids.length === 0 || ids.length !== modes.length) {
    redirect(`${returnTo}?error=Datos+invalidos`);
  }

  // Fecha de la orden (editable). Si viene, sobrescribe createdAt de la orden y
  // alinea la fecha de los cobros (abonos) de la venta para que concuerden.
  const orderDateRaw =
    typeof formData.get("orderDate") === "string" ? (formData.get("orderDate") as string).trim() : "";
  let orderDate: Date | undefined;
  if (orderDateRaw) {
    const parsedOrderDate = new Date(`${orderDateRaw}T12:00:00`);
    if (Number.isNaN(parsedOrderDate.getTime())) {
      redirect(`${returnTo}?error=La+fecha+de+la+orden+es+invalida`);
    }
    orderDate = parsedOrderDate;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, saleId: true },
  });
  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  // No se puede cambiar el modo de un item ya confirmado (inventario/saldo ya
  // movidos). Se bloquea solo si el modo realmente cambia respecto al actual.
  const currentItems = await prisma.orderItem.findMany({
    where: { id: { in: ids }, orderId },
    select: { id: true, fulfillmentMode: true, confirmedAt: true },
  });
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const blocked = ids.some((id, index) => {
    const current = currentById.get(id);
    if (!current || current.confirmedAt === null) return false;
    const nextMode = modes[index] === "MANUFACTURE" ? "MANUFACTURE" : "STOCK";
    return current.fulfillmentMode !== nextMode;
  });
  if (blocked) {
    redirect(`${returnTo}?error=Deshaz+la+confirmacion+de+los+productos+antes+de+cambiar+su+modo`);
  }

  await prisma.$transaction([
    ...ids.map((id, index) =>
      prisma.orderItem.updateMany({
        // El where con orderId asegura que solo se tocan items de esta orden.
        where: { id, orderId },
        data: { fulfillmentMode: modes[index] === "MANUFACTURE" ? "MANUFACTURE" : "STOCK" },
      }),
    ),
    ...(orderDate
      ? [
          prisma.order.update({
            where: { id: orderId },
            // La lista muestra releasedAt ?? createdAt, así que se alinean ambos
            // para que la fecha editada se refleje siempre.
            data: { createdAt: orderDate, releasedAt: orderDate },
          }),
          // Alinea las fechas del historial de la orden (la línea de tiempo).
          prisma.orderStatusHistory.updateMany({
            where: { orderId },
            data: { createdAt: orderDate },
          }),
          // Alinea los cargos/pagos a proveedores generados por esta orden
          // (la tabla de proveedores los muestra por createdAt).
          prisma.supplierLedgerEntry.updateMany({
            where: { orderId },
            data: { createdAt: orderDate },
          }),
          // La fecha del producto en el balance de proveedores es su confirmedAt.
          prisma.orderItem.updateMany({
            where: { orderId, confirmedAt: { not: null } },
            data: { confirmedAt: orderDate },
          }),
          // Y la fecha de pago de los que ya la tengan (abonos a proveedor).
          prisma.supplierLedgerEntry.updateMany({
            where: { orderId, paymentDate: { not: null } },
            data: { paymentDate: orderDate },
          }),
          // Alinea los cobros de la venta con la nueva fecha de la orden.
          ...(order.saleId
            ? [
                prisma.salePayment.updateMany({
                  where: { saleId: order.saleId },
                  data: { paymentDate: orderDate },
                }),
              ]
            : []),
        ]
      : []),
  ]);

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderId}`);
  if (orderDate) {
    revalidatePath("/admin/ventas");
    revalidatePath("/admin/balances");
    revalidatePath("/admin/proveedores");
  }
  redirect(`${returnTo}?ok=Orden+actualizada`);
}

// Edita la fecha de UNA entrada del historial de la orden (al hacer clic en la
// tarjeta). Opcionalmente alinea a esa misma fecha los cargos/pagos a
// proveedores generados por la orden.
export async function adminUpdateOrderHistoryDateAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const historyId = typeof formData.get("historyId") === "string" ? (formData.get("historyId") as string).trim() : "";
  const orderId = typeof formData.get("orderId") === "string" ? (formData.get("orderId") as string).trim() : "";
  const dateRaw = typeof formData.get("date") === "string" ? (formData.get("date") as string).trim() : "";
  const updateSupplierCharges = formData.get("updateSupplierCharges") != null;

  if (!historyId || !orderId) {
    redirect(`${returnTo}?error=Datos+invalidos`);
  }

  const parsedDate = new Date(`${dateRaw}T12:00:00`);
  if (!dateRaw || Number.isNaN(parsedDate.getTime())) {
    redirect(`${returnTo}?error=La+fecha+es+invalida`);
  }

  // Verifica que la entrada pertenezca a la orden indicada.
  const entry = await prisma.orderStatusHistory.findUnique({
    where: { id: historyId },
    select: { id: true, orderId: true, toStatus: true },
  });
  if (!entry || entry.orderId !== orderId) {
    redirect(`${returnTo}?error=Movimiento+no+encontrado`);
  }

  // Si el movimiento editado es la entrega (paso a "Cerrada"/COMPLETED), tambien
  // se mueve order.completedAt: es la fecha con la que Balances reconoce la venta
  // en su mes. Sin esto, editar la fecha del historial no cambia el reporte.
  const isCompletionEntry = entry.toStatus === "COMPLETED";

  await prisma.$transaction([
    prisma.orderStatusHistory.update({
      where: { id: historyId },
      data: { createdAt: parsedDate },
    }),
    ...(isCompletionEntry
      ? [
          prisma.order.update({
            where: { id: orderId },
            data: { completedAt: parsedDate },
          }),
        ]
      : []),
    ...(updateSupplierCharges
      ? [
          prisma.supplierLedgerEntry.updateMany({
            where: { orderId },
            data: { createdAt: parsedDate },
          }),
          prisma.supplierLedgerEntry.updateMany({
            where: { orderId, paymentDate: { not: null } },
            data: { paymentDate: parsedDate },
          }),
          // La fecha del producto en el balance de proveedores es su confirmedAt.
          prisma.orderItem.updateMany({
            where: { orderId, confirmedAt: { not: null } },
            data: { confirmedAt: parsedDate },
          }),
        ]
      : []),
  ]);

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderId}`);
  // La fecha de entrega mueve el mes de reconocimiento de la venta en Balances.
  if (updateSupplierCharges || isCompletionEntry) {
    revalidatePath("/admin/balances");
  }
  if (updateSupplierCharges) {
    revalidatePath("/admin/proveedores");
  }
  redirect(`${returnTo}?ok=Fecha+del+movimiento+actualizada`);
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
      order: { select: { id: true, code: true, status: true, saleId: true } },
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
    // El cargo (saldo) al proveedor se genera al confirmar la compra/fabricacion,
    // una sola vez por item. Antes se generaba al recoger.
    const chargeAmount = Number(parsed.data.purchaseCost) * orderItem.quantity;
    const shouldCharge = orderItem.supplierPaymentStatus === null && chargeAmount > 0;

    await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: orderItem.id },
        data: {
          confirmedSupplierId: parsed.data.supplierId,
          purchaseCost: parsed.data.purchaseCost,
          confirmedAt: new Date(),
          ...(shouldCharge ? { supplierPaymentStatus: "PENDING" } : {}),
        },
      });

      if (shouldCharge) {
        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: parsed.data.supplierId,
            type: "CHARGE",
            amount: chargeAmount,
            note: `Compra item - Orden ${orderItem.order.code}`,
            saleId: orderItem.order.saleId,
            orderId: orderItem.order.id,
            orderItemId: orderItem.id,
            createdById,
          },
        });
      }

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
            status: "IN_PROGRESS",
            quantity: orderItem.quantity,
            notes: jobNotes || null,
            startedAt: new Date(),
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

const confirmStockOrderItemSchema = z.object({
  orderItemId: z.string().trim().min(1, "Item invalido"),
});

// Confirma un item "por stock": descuenta el inventario (movimiento OUT) y deja
// el item listo para despachar. A diferencia de la confirmacion de fabricacion,
// NO genera saldo al proveedor ni orden de produccion, porque el producto ya se
// compro antes y esta en bodega.
export async function adminConfirmStockOrderItemAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = confirmStockOrderItemSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+confirmacion+invalidos`);
  }

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: parsed.data.orderItemId },
    include: {
      order: { select: { id: true, code: true, status: true } },
      product: { select: { name: true, baseCost: true, additionalCost: true } },
    },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Item+no+encontrado`);
  }

  if (orderItem.fulfillmentMode !== "STOCK") {
    redirect(`${returnTo}?error=El+producto+no+es+de+stock`);
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  if (orderItem.confirmedAt !== null) {
    redirect(`${returnTo}?error=El+item+ya+esta+confirmado`);
  }

  // Valida que haya stock suficiente al momento de confirmar (suma de movimientos).
  const stockAgg = await prisma.inventoryMovement.aggregate({
    where: { productId: orderItem.productId },
    _sum: { change: true },
  });
  const available = stockAgg._sum.change ?? 0;
  if (available < orderItem.quantity) {
    redirect(
      `${returnTo}?error=${encodeURIComponent(
        `Sin stock suficiente para ${orderItem.product.name} (necesita ${orderItem.quantity}, hay ${available})`,
      )}`,
    );
  }

  // Costo real de compra del inventario = costo proveedor + flete.
  const inventoryCost = Number(orderItem.product.baseCost) + Number(orderItem.product.additionalCost);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.create({
        data: {
          productId: orderItem.productId,
          type: "OUT",
          change: -orderItem.quantity,
          note: `Salida por orden ${orderItem.order.code}`,
          createdById,
        },
      });

      await tx.orderItem.update({
        where: { id: orderItem.id },
        data: {
          confirmedAt: new Date(),
          purchaseCost: inventoryCost,
        },
      });
    });
  } catch (error) {
    console.error("Failed to confirm stock order item:", error);
    redirect(`${returnTo}?error=No+se+pudo+confirmar+el+item`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/inventario");
  revalidatePath(`/admin/ordenes/${orderItem.order.id}`);
  redirect(`${returnTo}?ok=Producto+descontado+de+stock`);
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
      order: { select: { id: true, code: true, status: true, saleId: true, type: true } },
      photos: { select: { id: true } },
    },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Item+no+encontrado`);
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  // En una compra el item ya viene comprado (puede no tener proveedor ni foto), y
  // un producto de stock ya esta en bodega (no pasa por proveedor ni recogido);
  // en una venta de fabricacion hay que confirmar proveedor + costo + foto.
  const isPurchaseOrder = orderItem.order.type === "PURCHASE";
  const skipSupplierFlow = isPurchaseOrder || orderItem.fulfillmentMode === "STOCK";
  if (!skipSupplierFlow && (!orderItem.confirmedSupplierId || orderItem.purchaseCost === null)) {
    redirect(`${returnTo}?error=Confirma+el+proveedor+y+costo+antes+de+despachar`);
  }

  const newPhotoFiles = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const totalPhotos = orderItem.photos.length + newPhotoFiles.length;
  if (!skipSupplierFlow && totalPhotos === 0) {
    redirect(`${returnTo}?error=Sube+al+menos+una+foto+del+producto+terminado`);
  }

  const receiptFile = formData.get("receipt");
  const hasReceipt = receiptFile instanceof File && receiptFile.size > 0;
  if (paymentMode === "PAY_NOW" && !hasReceipt && !orderItem.supplierReceiptUrl) {
    redirect(`${returnTo}?error=Sube+el+recibo+de+pago+o+selecciona+pagar+luego`);
  }

  const amount = Number(orderItem.purchaseCost) * orderItem.quantity;
  const supplierId = orderItem.confirmedSupplierId;
  const accountIdRaw = formData.get("accountId");
  const accountId = typeof accountIdRaw === "string" && accountIdRaw.trim() ? accountIdRaw.trim() : null;
  if (paymentMode === "PAY_NOW" && !accountId) {
    redirect(`${returnTo}?error=Selecciona+la+cuenta+de+salida+del+pago`);
  }
  const alreadyPaid = orderItem.supplierPaymentStatus === "PAID";

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

      // El cargo (saldo) al proveedor ya se genero al confirmar (Fabricar/Compra);
      // al recoger solo se registra el pago si se elige pagar ahora.
      if (paymentMode === "PAY_NOW") {
        if (!alreadyPaid && amount > 0 && supplierId) {
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
              accountId,
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
      }

      await tx.productionJob.updateMany({
        where: {
          orderItemId: orderItem.id,
          status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
        },
        data: {
          status: "DONE",
          completedAt: new Date(),
        },
      });

      await syncOrderStatusAfterProduction(tx, orderItem.order.id, createdById);
    });
  } catch (error) {
    console.error("Failed to dispatch order item:", error);
    const message = error instanceof Error ? error.message : "No se pudo despachar el item";
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderItem.order.id}`);
  revalidatePath("/admin/produccion");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Item+listo+para+despacho`);
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

// Confirma (Fabricar) varios items de una sola vez usando el proveedor sugerido
// (preferido) de cada producto y su costo por defecto. Cada item pasa a produccion.
export async function adminBulkConfirmOrderItemsAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const ids = parseOrderItemIds(formData.get("orderItemIds"));
  if (ids.length === 0) {
    redirect(`${returnTo}?error=Selecciona+al+menos+un+producto`);
  }

  const items = await prisma.orderItem.findMany({
    where: { id: { in: ids } },
    include: {
      order: { select: { id: true, code: true, status: true, saleId: true } },
      product: {
        select: {
          name: true,
          baseCost: true,
          additionalCost: true,
          suppliers: {
            select: { supplierId: true, supplierCost: true },
            orderBy: { isPreferred: "desc" },
          },
        },
      },
      productionJobs: { select: { id: true } },
    },
  });

  if (items.length === 0) {
    redirect(`${returnTo}?error=Productos+no+encontrados`);
  }

  const orderId = items[0].order.id;
  const orderStatus = items[0].order.status;
  if (orderStatus === "CANCELLED" || orderStatus === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  // Stock disponible por producto (para los items "por stock"); se decrementa a
  // medida que se confirma cada item dentro del lote.
  const stockProductIds = Array.from(
    new Set(items.filter((item) => item.fulfillmentMode === "STOCK").map((item) => item.productId)),
  );
  const stockAvailable = new Map<string, number>();
  if (stockProductIds.length > 0) {
    const sums = await prisma.inventoryMovement.groupBy({
      by: ["productId"],
      where: { productId: { in: stockProductIds } },
      _sum: { change: true },
    });
    for (const id of stockProductIds) stockAvailable.set(id, 0);
    for (const sum of sums) stockAvailable.set(sum.productId, sum._sum.change ?? 0);
  }

  let confirmed = 0;
  let skipped = 0;

  try {
    await prisma.$transaction(async (tx) => {
      const lastJob = await tx.productionJob.findFirst({
        select: { code: true },
        orderBy: { code: "desc" },
      });
      let nextJobNumber = (lastJob ? parseProductionJobCodeNumber(lastJob.code) : 0) + 1;
      let createdAnyJob = false;

      for (const item of items) {
        // Productos por stock: descuentan inventario, sin proveedor ni produccion.
        if (item.fulfillmentMode === "STOCK") {
          if (item.confirmedAt !== null) {
            skipped += 1;
            continue;
          }
          const available = stockAvailable.get(item.productId) ?? 0;
          if (available < item.quantity) {
            skipped += 1;
            continue;
          }
          const inventoryCost =
            Number(item.product.baseCost) + Number(item.product.additionalCost);
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              type: "OUT",
              change: -item.quantity,
              note: `Salida por orden ${item.order.code}`,
              createdById,
            },
          });
          await tx.orderItem.update({
            where: { id: item.id },
            data: { confirmedAt: new Date(), purchaseCost: inventoryCost },
          });
          stockAvailable.set(item.productId, available - item.quantity);
          confirmed += 1;
          continue;
        }

        const alreadyConfirmed = Boolean(item.confirmedSupplierId) && item.purchaseCost !== null;
        const preferred = item.product.suppliers[0];
        if (alreadyConfirmed || !preferred) {
          skipped += 1;
          continue;
        }

        const cost = Number(preferred.supplierCost ?? item.product.baseCost ?? 0);
        // El cargo (saldo) al proveedor se genera al confirmar, una sola vez.
        const chargeAmount = cost * item.quantity;
        const shouldCharge = item.supplierPaymentStatus === null && chargeAmount > 0;
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            confirmedSupplierId: preferred.supplierId,
            purchaseCost: cost,
            confirmedAt: new Date(),
            ...(shouldCharge ? { supplierPaymentStatus: "PENDING" } : {}),
          },
        });

        if (shouldCharge) {
          await tx.supplierLedgerEntry.create({
            data: {
              supplierId: preferred.supplierId,
              type: "CHARGE",
              amount: chargeAmount,
              note: `Compra item - Orden ${item.order.code}`,
              saleId: item.order.saleId,
              orderId,
              orderItemId: item.id,
              createdById,
            },
          });
        }

        if (item.productionJobs.length === 0) {
          const meta = parseQuoteItemMeta(item.notes);
          const jobNotes = [meta.description, meta.color ? `Color: ${meta.color}` : ""]
            .filter(Boolean)
            .join(" - ");
          const code = buildProductionJobCode(nextJobNumber);
          nextJobNumber += 1;
          await tx.productionJob.create({
            data: {
              code,
              orderId,
              orderItemId: item.id,
              status: "IN_PROGRESS",
              quantity: item.quantity,
              notes: jobNotes || null,
              startedAt: new Date(),
              createdById,
            },
          });
          createdAnyJob = true;
        }
        confirmed += 1;
      }

      if (createdAnyJob && (orderStatus === "DRAFT" || orderStatus === "RELEASED")) {
        await tx.order.update({ where: { id: orderId }, data: { status: "IN_PRODUCTION" } });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: orderStatus,
            toStatus: "IN_PRODUCTION",
            note: "Items confirmados y enviados a produccion",
            changedById: createdById,
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to bulk confirm order items:", error);
    redirect(`${returnTo}?error=No+se+pudo+confirmar+los+productos`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/produccion");
  revalidatePath(`/admin/ordenes/${orderId}`);
  const okMsg = skipped > 0 ? `Confirmados ${confirmed}, omitidos ${skipped}` : `Confirmados ${confirmed} productos`;
  redirect(`${returnTo}?ok=${encodeURIComponent(okMsg)}`);
}

// Recoge (marca listos) varios items de una sola vez: aplica UNA foto del producto
// terminado a todos y deja el pago al proveedor pendiente (saldo).
export async function adminBulkPickupOrderItemsAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const ids = parseOrderItemIds(formData.get("orderItemIds"));
  if (ids.length === 0) {
    redirect(`${returnTo}?error=Selecciona+al+menos+un+producto`);
  }

  const photoFile = formData.get("photo");
  const hasPhoto = photoFile instanceof File && photoFile.size > 0;
  if (!hasPhoto) {
    redirect(`${returnTo}?error=Sube+una+foto+del+producto+terminado`);
  }

  const items = await prisma.orderItem.findMany({
    where: { id: { in: ids } },
    include: {
      order: { select: { id: true, code: true, status: true, saleId: true } },
    },
  });

  if (items.length === 0) {
    redirect(`${returnTo}?error=Productos+no+encontrados`);
  }

  const orderId = items[0].order.id;
  const orderStatus = items[0].order.status;
  if (orderStatus === "CANCELLED" || orderStatus === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  const notConfirmed = items.some((item) => !item.confirmedSupplierId || item.purchaseCost === null);
  if (notConfirmed) {
    redirect(`${returnTo}?error=Todos+deben+estar+confirmados+(Fabricar)+antes+de+recoger`);
  }

  let processed = 0;

  try {
    const savedPhoto = await saveOrderItemPhoto(photoFile, orderId, 0);

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.orderItemPhoto.create({
          data: { orderItemId: item.id, url: savedPhoto.url, name: savedPhoto.name },
        });

        // El cargo (saldo) al proveedor ya se genero al confirmar (Fabricar);
        // recoger solo adjunta la foto y cierra la produccion.

        await tx.productionJob.updateMany({
          where: {
            orderItemId: item.id,
            status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
          },
          data: { status: "DONE", completedAt: new Date() },
        });
        processed += 1;
      }

      await syncOrderStatusAfterProduction(tx, orderId, createdById);
    });
  } catch (error) {
    console.error("Failed to bulk pickup order items:", error);
    const message = error instanceof Error ? error.message : "No se pudo recoger los productos";
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderId}`);
  revalidatePath("/admin/produccion");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=${encodeURIComponent(`Recogidos ${processed} productos`)}`);
}

const undoConfirmSchema = z.object({
  orderItemId: z.string().trim().min(1, "Producto invalido"),
});

// Deshace el "Fabricar" (confirmacion) de un producto: borra su orden de
// produccion, limpia el proveedor/costo confirmado y, si la orden ya no tiene
// produccion, la regresa a "Liberada". El producto vuelve a "Sin confirmar".
export async function adminUndoConfirmOrderItemAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = undoConfirmSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Producto+invalido`);
  }

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: parsed.data.orderItemId },
    include: {
      order: { select: { id: true, code: true, status: true } },
      photos: { select: { id: true } },
      dispatchItems: {
        where: { dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } } },
        select: { id: true },
      },
    },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Producto+no+encontrado`);
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  // No se puede deshacer la confirmacion si el producto ya avanzo de etapa.
  if (orderItem.dispatchItems.length > 0) {
    redirect(`${returnTo}?error=Deshaz+primero+el+despacho+del+producto`);
  }

  // Stock: la confirmacion solo descuenta inventario. Se revierte con un
  // movimiento compensatorio IN y se limpia la confirmacion del item.
  if (orderItem.fulfillmentMode === "STOCK") {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryMovement.create({
          data: {
            productId: orderItem.productId,
            type: "IN",
            change: orderItem.quantity,
            note: `Reversa salida por orden ${orderItem.order.code}`,
            createdById,
          },
        });
        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: { confirmedAt: null, purchaseCost: null },
        });
      });
    } catch (error) {
      console.error("Failed to undo stock confirm order item:", error);
      redirect(`${returnTo}?error=No+se+pudo+deshacer+la+confirmacion`);
    }

    revalidatePath("/admin/ordenes");
    revalidatePath("/admin/inventario");
    revalidatePath(`/admin/ordenes/${orderItem.order.id}`);
    redirect(`${returnTo}?ok=Confirmacion+deshecha+y+stock+restituido`);
  }

  // El pago ya realizado o el recogido (foto) deben deshacerse antes que la fabricacion.
  if (orderItem.supplierPaymentStatus === "PAID" || orderItem.photos.length > 0) {
    redirect(`${returnTo}?error=Deshaz+primero+el+recogido+del+producto`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Borrar las ordenes de produccion del producto.
      await tx.productionJob.deleteMany({ where: { orderItemId: orderItem.id } });

      // 2) Revertir el cargo (saldo) al proveedor generado al confirmar.
      await tx.supplierLedgerEntry.deleteMany({
        where: {
          orderItemId: orderItem.id,
          type: "CHARGE",
          dispatchId: null,
          inventoryMovementId: null,
        },
      });

      // 3) Limpiar el proveedor/costo confirmado y el estado de pago.
      await tx.orderItem.update({
        where: { id: orderItem.id },
        data: {
          confirmedSupplierId: null,
          purchaseCost: null,
          confirmedAt: null,
          supplierPaymentStatus: null,
        },
      });

      // 4) Si la orden estaba en produccion y ya no le queda ninguna, vuelve a "Liberada".
      if (orderItem.order.status === "IN_PRODUCTION") {
        const remainingJobs = await tx.productionJob.count({
          where: { orderId: orderItem.order.id },
        });
        if (remainingJobs === 0) {
          await tx.order.update({
            where: { id: orderItem.order.id },
            data: { status: "RELEASED" },
          });
          await tx.orderStatusHistory.create({
            data: {
              orderId: orderItem.order.id,
              fromStatus: "IN_PRODUCTION",
              toStatus: "RELEASED",
              note: "Fabricacion deshecha",
              changedById: createdById,
            },
          });
        }
      }
    });
  } catch (error) {
    console.error("Failed to undo confirm order item:", error);
    redirect(`${returnTo}?error=No+se+pudo+deshacer+la+fabricacion`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderItem.order.id}`);
  revalidatePath("/admin/produccion");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Fabricacion+deshecha`);
}

const undoPickupSchema = z.object({
  orderItemId: z.string().trim().min(1, "Producto invalido"),
});

// Deshace el "Recogido" de un producto: revierte el cargo/pago al proveedor,
// borra las fotos del producto terminado, limpia el estado de pago y devuelve
// las ordenes de produccion a "En progreso". El producto vuelve a "Fabricando".
export async function adminUndoPickupOrderItemAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = undoPickupSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Producto+invalido`);
  }

  const orderItem = await prisma.orderItem.findUnique({
    where: { id: parsed.data.orderItemId },
    include: {
      order: { select: { id: true, code: true, status: true } },
      photos: { select: { id: true } },
      dispatchItems: {
        where: { dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } } },
        select: { id: true },
      },
    },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Producto+no+encontrado`);
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=La+orden+no+admite+cambios`);
  }

  // No se puede deshacer el recogido si el producto ya esta despachado.
  if (orderItem.dispatchItems.length > 0) {
    redirect(`${returnTo}?error=Deshaz+primero+el+despacho+del+producto`);
  }

  // Stock: el producto nunca pasa por proveedor ni recogido real; su salida de
  // inventario se hizo al confirmar. Deshacerlo devuelve las unidades al stock
  // (movimiento IN compensatorio) y deja el item "Sin confirmar".
  if (orderItem.fulfillmentMode === "STOCK") {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryMovement.create({
          data: {
            productId: orderItem.productId,
            type: "IN",
            change: orderItem.quantity,
            note: `Reversa salida por orden ${orderItem.order.code}`,
            createdById,
          },
        });
        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: { confirmedAt: null, purchaseCost: null },
        });
      });
    } catch (error) {
      console.error("Failed to undo stock pickup order item:", error);
      redirect(`${returnTo}?error=No+se+pudo+devolver+el+producto+a+stock`);
    }

    revalidatePath("/admin/ordenes");
    revalidatePath("/admin/inventario");
    revalidatePath(`/admin/ordenes/${orderItem.order.id}`);
    redirect(`${returnTo}?ok=Producto+devuelto+a+stock`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Revertir solo el pago al proveedor hecho al recoger. El cargo (saldo)
      // se genero al confirmar (Fabricar), asi que se conserva y el item vuelve
      // a quedar con el saldo pendiente.
      await tx.supplierLedgerEntry.deleteMany({
        where: {
          orderItemId: orderItem.id,
          type: "PAYMENT",
          dispatchId: null,
          inventoryMovementId: null,
        },
      });

      // 2) Borrar las fotos del producto terminado.
      await tx.orderItemPhoto.deleteMany({ where: { orderItemId: orderItem.id } });

      // 3) El item vuelve a "saldo pendiente" con el proveedor (no a sin cargo).
      await tx.orderItem.update({
        where: { id: orderItem.id },
        data: {
          supplierPaymentStatus: "PENDING",
          supplierReceiptUrl: null,
          supplierReceiptName: null,
        },
      });

      // 4) Devolver las ordenes de produccion a "En progreso".
      await tx.productionJob.updateMany({
        where: { orderItemId: orderItem.id, status: "DONE" },
        data: { status: "IN_PROGRESS", completedAt: null },
      });

      await syncOrderStatusAfterProduction(tx, orderItem.order.id, createdById);
    });
  } catch (error) {
    console.error("Failed to undo pickup order item:", error);
    redirect(`${returnTo}?error=No+se+pudo+deshacer+el+recogido`);
  }

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${orderItem.order.id}`);
  revalidatePath("/admin/produccion");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Recogido+deshecho`);
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
