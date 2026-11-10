"use server";

import { hasAnyModuleAccess } from "@/lib/admin-module-access";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { closedOrderMessage, ORDER_CANCELLED_BLOCK } from "@/lib/order-cancellation";
import { buildProductionJobCode, parseProductionJobCodeNumber } from "@/lib/orders";
import { splitOrderItemQuantities } from "@/lib/order-partial-delivery";
import { bloqueaDeshacerFabricacion } from "@/lib/order-dispatch";
import { getActivityActor, logActivity, logActivityTx } from "@/lib/activity-log";
import { SUPPLIER_LEDGER_LOG_FIELDS, snapshotForLog } from "@/lib/activity-log-snapshot";
import { anularVarias, bloqueoPorAbonos } from "@/lib/anulaciones";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { syncOrderStatusAfterProduction } from "@/app/actions/orders-actions";
import { computeStockExitCost } from "@/lib/stock-exit-cost";
import { confirmOrderItemSupplier, type ConfirmOrderItemSupplierResult } from "@/lib/order-item-confirm";
import { displayCode } from "@/lib/code-display";
import { fechaFabricacionDeDia, resumenCambioFechaOf } from "@/lib/delivery-tracking";
import { fijarFechaFabricacion, proveedorasDelLote } from "@/lib/manufacturing-orders";
import { withNegativeBalanceNotice } from "@/modules/balances/application/use-cases";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import {
  MOTIVO_FIELD,
  esEdicionRetroactiva,
  exigirMotivoSiRetroactivo,
} from "@/modules/retroactivos/domain/retroactivo";
import {
  SESION_VENCIDA,
  datosRegistroRetroactivo,
  usuarioExiste,
} from "@/modules/retroactivos/infrastructure/registrar-retroactivo";

const balances = createPrismaBalancesRepository();

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

// Mismos mensajes de siempre del boton "Fabricar".
const CONFIRM_ITEM_ERRORS: Record<Extract<ConfirmOrderItemSupplierResult, { ok: false }>["motivo"], string> = {
  item_no_encontrado: "Item+no+encontrado",
  orden_cancelada: encodeURIComponent(ORDER_CANCELLED_BLOCK),
  orden_cerrada: "La+orden+no+admite+cambios",
  proveedor_no_pertenece: "El+proveedor+no+pertenece+al+producto",
};

// Fecha de entrega de fabricación (obligatoria al confirmar una compra de fabricación en una venta).
const FECHA_FABRICACION_FALTA = "Elige la fecha de entrega de fabricación (hoy o después)";
const FECHA_FABRICACION_NO_GUARDADA =
  "Compra confirmada, pero no se pudo guardar la fecha: ponla en la pestaña Fabricación";

function leerFechaFabricacion(formData: FormData): string | null {
  const dia = String(formData.get("fechaFabricacion") ?? "").trim();
  return fechaFabricacionDeDia(dia, new Date()) ? dia : null;
}

// Después de confirmar: guarda el día en la OF de cada proveedora y lo anota en la bitácora
// (sale en "Historial de fechas"). false si no se pudo: la compra ya quedó confirmada.
async function guardarFechaFabricacion(orderId: string, supplierIds: string[], dia: string): Promise<boolean> {
  try {
    const cambios = await fijarFechaFabricacion(orderId, supplierIds, dia);
    for (const cambio of cambios) {
      await logActivity({
        action: "UPDATE",
        entityType: "ORDER",
        entityId: cambio.orderId,
        entityCode: cambio.code,
        summary: `${resumenCambioFechaOf(displayCode(cambio.code), {
          estimada: { antes: cambio.antes.estimatedDeliveryAt, despues: cambio.despues.estimatedDeliveryAt },
        })} (al confirmar la compra)`,
        before: {
          deliveryDate: cambio.antes.deliveryDate?.toISOString() ?? null,
          estimatedDeliveryAt: cambio.antes.estimatedDeliveryAt?.toISOString() ?? null,
        },
        after: {
          deliveryDate: cambio.despues.deliveryDate.toISOString(),
          estimatedDeliveryAt: cambio.despues.estimatedDeliveryAt.toISOString(),
        },
      });
    }
    return true;
  } catch (error) {
    console.error("Failed to set manufacturing delivery date:", error);
    return false;
  }
}

const deletePhotoSchema = z.object({
  photoId: z.string().trim().min(1, "Foto invalida"),
});

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["orders"]))) {
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
  const userId = await requireAdminSession();
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
    select: {
      id: true,
      saleId: true,
      createdAt: true,
      sale: { select: { salePayments: { select: { id: true, amount: true, paymentDate: true, createdAt: true } } } },
    },
  });
  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  // Retroactivo: si el usuario cambia la fecha de la orden a un dia anterior a hoy, la nueva fecha
  // alinea los abonos de la venta: se exige motivo y se registra cada abono cuyo dia cambia.
  // (Guardar el modal sin tocar la fecha no pide motivo, aunque re-alinee abonos como antes.)
  const orderDayChanged = orderDate ? esEdicionRetroactiva(orderDateRaw, order.createdAt) : false;
  const retroPayments = orderDayChanged
    ? (order.sale?.salePayments ?? []).filter((payment) =>
        esEdicionRetroactiva(orderDateRaw, payment.paymentDate ?? payment.createdAt),
      )
    : [];
  const motivoCheck = exigirMotivoSiRetroactivo(retroPayments.length > 0, formData.get(MOTIVO_FIELD));
  if (!motivoCheck.ok) {
    redirect(`${returnTo}?${new URLSearchParams({ error: motivoCheck.error }).toString()}`);
  }
  if (motivoCheck.motivo && !(await usuarioExiste(prisma, userId))) {
    redirect(`${returnTo}?${new URLSearchParams({ error: SESION_VENCIDA }).toString()}`);
  }
  const retroRows = motivoCheck.motivo
    ? retroPayments.map((payment) =>
        datosRegistroRetroactivo({
          tipo: "ABONO",
          registroId: payment.id,
          fechaPuesta: orderDateRaw,
          usuarioId: userId,
          motivo: motivoCheck.motivo as string,
          monto: payment.amount,
        }),
      )
    : [];

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
          ...(retroRows.length > 0 ? [prisma.registroRetroactivo.createMany({ data: retroRows })] : []),
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

  // La fecha se exige antes de confirmar (sin ella no se crea el cargo). Las compras no tienen OF.
  const itemOrder = await prisma.orderItem.findUnique({
    where: { id: parsed.data.orderItemId },
    select: { order: { select: { type: true } } },
  });
  const pideFecha = itemOrder?.order.type !== "PURCHASE";
  const fechaFabricacion = leerFechaFabricacion(formData);
  if (pideFecha && !fechaFabricacion) {
    redirect(`${returnTo}?${new URLSearchParams({ error: FECHA_FABRICACION_FALTA }).toString()}`);
  }

  let result: ConfirmOrderItemSupplierResult;
  try {
    result = await prisma.$transaction((tx) =>
      confirmOrderItemSupplier(tx, {
        orderItemId: parsed.data.orderItemId,
        supplierId: parsed.data.supplierId,
        unitCost: parsed.data.purchaseCost,
        actorId: createdById,
      }),
    );
  } catch (error) {
    console.error("Failed to confirm order item:", error);
    redirect(`${returnTo}?error=No+se+pudo+confirmar+el+item`);
  }

  if (!result.ok) {
    redirect(`${returnTo}?error=${CONFIRM_ITEM_ERRORS[result.motivo]}`);
  }

  const fechaGuardada =
    !pideFecha || !fechaFabricacion
      ? true
      : await guardarFechaFabricacion(result.orderId, [parsed.data.supplierId], fechaFabricacion);

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/produccion");
  revalidatePath(`/admin/ordenes/${result.orderId}`);
  if (!fechaGuardada) {
    redirect(`${returnTo}?${new URLSearchParams({ error: FECHA_FABRICACION_NO_GUARDADA }).toString()}`);
  }
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
      product: { select: { name: true } },
    },
  });

  if (!orderItem) {
    redirect(`${returnTo}?error=Item+no+encontrado`);
  }

  if (orderItem.fulfillmentMode !== "STOCK") {
    redirect(`${returnTo}?error=El+producto+no+es+de+stock`);
  }

  if (orderItem.order.status === "CANCELLED" || orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(orderItem.order.status, "La orden no admite cambios"))}`);
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

  // Costo de la compra que entró estas unidades (o el de catálogo si no hay compra).
  const exitCost = await computeStockExitCost({
    productId: orderItem.productId,
    quantity: orderItem.quantity,
    stockOnHand: available,
  });

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
          purchaseCost: exitCost.unitCost,
          stockCostSource: exitCost.source,
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
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(orderItem.order.status, "La orden no admite cambios"))}`);
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
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(orderItem.order.status, "La orden no admite cambios"))}`);
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
  // La cuenta del dueño (OWNER) solo se usa en Gastos.
  if (accountId && (await prisma.account.count({ where: { id: accountId, type: "OWNER" } })) > 0) {
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
  const okMessage = await withNegativeBalanceNotice(
    balances,
    "Item listo para despacho",
    // Solo si de verdad salio plata de esa cuenta (mismo criterio que crea el PAYMENT).
    paymentMode === "PAY_NOW" && !alreadyPaid && amount > 0 && supplierId ? accountId : null,
  );
  redirect(`${returnTo}?${new URLSearchParams({ ok: okMessage }).toString()}`);
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
      order: { select: { id: true, code: true, status: true, saleId: true, type: true } },
      product: {
        select: {
          name: true,
          baseCost: true,
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
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(orderStatus, "La orden no admite cambios"))}`);
  }

  // Con productos de fabricación la fecha es obligatoria y se exige antes de confirmar nada.
  const pideFecha = items[0].order.type !== "PURCHASE" && proveedorasDelLote(items).length > 0;
  const fechaFabricacion = leerFechaFabricacion(formData);
  if (pideFecha && !fechaFabricacion) {
    redirect(`${returnTo}?${new URLSearchParams({ error: FECHA_FABRICACION_FALTA }).toString()}`);
  }
  // Proveedoras que de verdad quedaron confirmadas en el lote (sus OF reciben la fecha).
  const confirmedSupplierIds = new Set<string>();

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
  const stockBeforeBatch = new Map(stockAvailable);

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
          // Lote: el stock de antes del lote y lo que ya tomaron otras líneas de la misma pieza.
          const exitCost = await computeStockExitCost(
            {
              productId: item.productId,
              quantity: item.quantity,
              stockOnHand: stockBeforeBatch.get(item.productId) ?? 0,
              alreadyTaken: (stockBeforeBatch.get(item.productId) ?? 0) - available,
            },
            tx,
          );
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
            data: { confirmedAt: new Date(), purchaseCost: exitCost.unitCost, stockCostSource: exitCost.source },
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
        confirmedSupplierIds.add(preferred.supplierId);

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

  const fechaGuardada =
    !pideFecha || !fechaFabricacion || confirmedSupplierIds.size === 0
      ? true
      : await guardarFechaFabricacion(orderId, [...confirmedSupplierIds], fechaFabricacion);

  revalidatePath("/admin/ordenes");
  revalidatePath("/admin/produccion");
  revalidatePath(`/admin/ordenes/${orderId}`);
  if (!fechaGuardada) {
    redirect(`${returnTo}?${new URLSearchParams({ error: FECHA_FABRICACION_NO_GUARDADA }).toString()}`);
  }
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
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(orderStatus, "La orden no admite cambios"))}`);
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

// Foto del producto de la orden para la bitácora (sin imágenes: solo nombres de archivo).
const ORDER_ITEM_LOG_FIELDS = [
  "id",
  "productId",
  "quantity",
  "fulfillmentMode",
  "confirmedSupplierId",
  "purchaseCost",
  "stockCostSource",
  "confirmedAt",
  "supplierPaymentStatus",
  "supplierReceiptName",
] as const;

// Un "deshacer" que no se puede hacer: su mensaje va tal cual a la pantalla.
class UndoBlockedError extends Error {}

const PRODUCTION_JOB_LOG_FIELDS = ["id", "code", "status", "quantity", "assignedToId", "startedAt", "completedAt"] as const;

// Devolución abierta = sin cerrar ni anular (estaAbierta en src/lib/order-return.ts).
async function orderHasOpenReturn(orderId: string): Promise<boolean> {
  const open = await prisma.orderReturn.findFirst({
    where: { orderId, closedAt: null, annulledAt: null },
    select: { id: true },
  });
  return open !== null;
}

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
      photos: { select: { id: true, name: true } },
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
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(orderItem.order.status, "La orden no admite cambios"))}`);
  }

  // Con una devolución abierta no se limpia el costo ni se suma inventario: cambiaría costo y ganancia.
  if (await orderHasOpenReturn(orderItem.order.id)) {
    redirect(`${returnTo}?error=La+orden+tiene+una+devolucion+abierta`);
  }

  // No se puede deshacer la confirmacion si el producto ya avanzo de etapa.
  if (orderItem.dispatchItems.length > 0) {
    redirect(`${returnTo}?error=Deshaz+primero+el+despacho+del+producto`);
  }
  const actor = await getActivityActor();

  // Stock: la confirmacion solo descuenta inventario. Se revierte con un
  // movimiento compensatorio IN y se limpia la confirmacion del item.
  if (orderItem.fulfillmentMode === "STOCK") {
    try {
      await prisma.$transaction(async (tx) => {
        await logActivityTx(tx, actor, {
          action: "UPDATE",
          entityType: "ORDER",
          entityId: orderItem.order.id,
          entityCode: orderItem.order.code,
          summary: `Deshizo la confirmación de un producto de stock de ${orderItem.order.code} (${orderItem.quantity} u. vuelven al inventario)`,
          before: { producto: snapshotForLog(orderItem, ORDER_ITEM_LOG_FIELDS) },
          after: { unidadesDevueltasAlInventario: orderItem.quantity },
        });
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
          data: { confirmedAt: null, purchaseCost: null, stockCostSource: null },
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
  if (
    bloqueaDeshacerFabricacion({
      supplierPaymentStatus: orderItem.supplierPaymentStatus,
      photoCount: orderItem.photos.length,
    })
  ) {
    redirect(`${returnTo}?error=Deshaz+primero+el+recogido+del+producto`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Mismos filtros para leer (copia en la bitácora) y para borrar.
      const jobsWhere = { orderItemId: orderItem.id };
      const chargesWhere = {
        orderItemId: orderItem.id,
        type: "CHARGE" as const,
        dispatchId: null,
        inventoryMovementId: null,
      };
      const jobs = await tx.productionJob.findMany({ where: jobsWhere });
      const charges = await tx.supplierLedgerEntry.findMany({ where: chargesWhere });
      // Si no se puede anotar, no se deshace nada.
      await logActivityTx(tx, actor, {
        action: "DELETE",
        entityType: "ORDER",
        entityId: orderItem.order.id,
        entityCode: orderItem.order.code,
        summary: `Deshizo la fabricación de un producto de ${orderItem.order.code}`,
        before: {
          producto: snapshotForLog(orderItem, ORDER_ITEM_LOG_FIELDS),
          produccionesBorradas: jobs.map((job) => snapshotForLog(job, PRODUCTION_JOB_LOG_FIELDS)),
          cargosProveedoraBorrados: charges.map((row) => snapshotForLog(row, SUPPLIER_LEDGER_LOG_FIELDS)),
          fotosBorradas: orderItem.photos.map((photo) => photo.name ?? photo.id),
          cantidadFotosBorradas: orderItem.photos.length,
        },
      });

      // Un cargo con abonos no se anula (el abono se iría en cascada).
      const settled = await tx.supplierLedgerEntry.count({
        where: { type: "PAYMENT", settlesEntryId: { in: charges.map((row) => row.id) } },
      });
      const blocked = bloqueoPorAbonos(settled);
      if (blocked) throw new UndoBlockedError(blocked);
      const anulacion = {
        motivo: `Deshizo la fabricación de un producto de ${orderItem.order.code}`,
        usuarioId: actor.id,
        usuarioNombre: actor.name,
      };

      // 1) Anular (copia + borrado) las ordenes de produccion del producto.
      await anularVarias(tx, "ProductionJob", jobs, anulacion);

      // 2) Anular el cargo (saldo) al proveedor generado al confirmar.
      await anularVarias(tx, "SupplierLedgerEntry", charges, { ...anulacion, codigo: (row) => (row.code as string | null) ?? orderItem.order.code });

      // 3) Limpiar el proveedor/costo confirmado, el estado de pago y las fotos (pieza de $0 sin Recogido).
      await tx.orderItemPhoto.deleteMany({ where: { orderItemId: orderItem.id } });
      await tx.orderItem.update({
        where: { id: orderItem.id },
        data: {
          confirmedSupplierId: null,
          purchaseCost: null,
          stockCostSource: null,
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
    if (error instanceof UndoBlockedError) {
      redirect(`${returnTo}?${new URLSearchParams({ error: error.message }).toString()}`);
    }
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
      photos: { select: { id: true, name: true } },
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
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(orderItem.order.status, "La orden no admite cambios"))}`);
  }

  // Con una devolución abierta no se limpia el costo ni se suma inventario: cambiaría costo y ganancia.
  if (await orderHasOpenReturn(orderItem.order.id)) {
    redirect(`${returnTo}?error=La+orden+tiene+una+devolucion+abierta`);
  }

  // No se puede deshacer el recogido si el producto ya esta despachado.
  if (orderItem.dispatchItems.length > 0) {
    redirect(`${returnTo}?error=Deshaz+primero+el+despacho+del+producto`);
  }
  const actor = await getActivityActor();

  // Stock: el producto nunca pasa por proveedor ni recogido real; su salida de
  // inventario se hizo al confirmar. Deshacerlo devuelve las unidades al stock
  // (movimiento IN compensatorio) y deja el item "Sin confirmar".
  if (orderItem.fulfillmentMode === "STOCK") {
    try {
      await prisma.$transaction(async (tx) => {
        await logActivityTx(tx, actor, {
          action: "UPDATE",
          entityType: "ORDER",
          entityId: orderItem.order.id,
          entityCode: orderItem.order.code,
          summary: `Devolvió a stock un producto de ${orderItem.order.code} (${orderItem.quantity} u. vuelven al inventario)`,
          before: { producto: snapshotForLog(orderItem, ORDER_ITEM_LOG_FIELDS) },
          after: { unidadesDevueltasAlInventario: orderItem.quantity },
        });
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
          data: { confirmedAt: null, purchaseCost: null, stockCostSource: null },
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
      const paymentsWhere = {
        orderItemId: orderItem.id,
        type: "PAYMENT" as const,
        dispatchId: null,
        inventoryMovementId: null,
      };
      const payments = await tx.supplierLedgerEntry.findMany({ where: paymentsWhere });
      const doneJobs = await tx.productionJob.findMany({ where: { orderItemId: orderItem.id, status: "DONE" } });
      // Si no se puede anotar, no se deshace nada.
      await logActivityTx(tx, actor, {
        action: "DELETE",
        entityType: "ORDER",
        entityId: orderItem.order.id,
        entityCode: orderItem.order.code,
        summary: `Deshizo el recogido de un producto de ${orderItem.order.code}`,
        before: {
          producto: snapshotForLog(orderItem, ORDER_ITEM_LOG_FIELDS),
          pagosProveedoraBorrados: payments.map((row) => snapshotForLog(row, SUPPLIER_LEDGER_LOG_FIELDS)),
          fotosBorradas: orderItem.photos.map((photo) => photo.name ?? photo.id),
          cantidadFotosBorradas: orderItem.photos.length,
          produccionesDevueltasAEnProgreso: doneJobs.map((job) => snapshotForLog(job, PRODUCTION_JOB_LOG_FIELDS)),
        },
        after: { supplierPaymentStatus: "PENDING", supplierReceiptName: null },
      });

      await anularVarias(tx, "SupplierLedgerEntry", payments, {
        motivo: `Deshizo el recogido de un producto de ${orderItem.order.code}`,
        usuarioId: actor.id,
        usuarioNombre: actor.name,
        codigo: (row) => (row.code as string | null) ?? orderItem.order.code,
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
    select: {
      id: true,
      name: true,
      orderItemId: true,
      orderItem: { select: { orderId: true, order: { select: { code: true, status: true } } } },
    },
  });

  if (!photo) {
    redirect(`${returnTo}?error=Foto+no+encontrada`);
  }

  if (photo.orderItem.order.status === "CANCELLED" || photo.orderItem.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(photo.orderItem.order.status, "La orden no admite cambios"))}`);
  }

  await prisma.orderItemPhoto.delete({ where: { id: photo.id } });
  await logActivity({
    action: "DELETE",
    entityType: "ORDER",
    entityId: photo.orderItem.orderId,
    entityCode: photo.orderItem.order.code,
    summary: `Eliminó una foto de un producto de ${photo.orderItem.order.code}`,
    before: { fotoId: photo.id, nombre: photo.name ?? null, orderItemId: photo.orderItemId },
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${photo.orderItem.orderId}`);
  redirect(`${returnTo}?ok=Foto+eliminada`);
}

// Separa unidades de una línea en otra línea igual (mismo precio, costo, proveedor y modo)
// para poder despachar, entregar o devolver a stock solo una parte. No toca cargos al proveedor:
// quedan en la línea original.
export async function adminSplitOrderItemAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = z
    .object({
      orderItemId: z.string().trim().min(1),
      splitQty: z.coerce.number().int().min(1),
    })
    .safeParse({ orderItemId: formData.get("orderItemId"), splitQty: formData.get("splitQty") });
  if (!parsed.success) {
    redirect(`${returnTo}?error=Cantidad+invalida`);
  }

  const item = await prisma.orderItem.findUnique({
    where: { id: parsed.data.orderItemId },
    include: {
      order: { select: { id: true, code: true, status: true } },
      product: { select: { name: true } },
      _count: { select: { productionJobs: true } },
      dispatchItems: {
        where: { dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } } },
        select: { id: true },
      },
    },
  });
  if (!item) {
    redirect(`${returnTo}?error=Producto+no+encontrado`);
  }
  if (item.order.status === "CANCELLED" || item.order.status === "COMPLETED") {
    redirect(`${returnTo}?error=${encodeURIComponent(closedOrderMessage(item.order.status, "La orden no admite cambios"))}`);
  }
  if (item.dispatchItems.length > 0) {
    redirect(`${returnTo}?error=Deshaz+primero+el+despacho+del+producto`);
  }
  if (item._count.productionJobs > 0) {
    redirect(`${returnTo}?error=No+se+puede+separar+un+producto+con+produccion`);
  }

  const split = splitOrderItemQuantities(
    item.quantity,
    Number(item.lineTotal),
    Number(item.unitPrice),
    parsed.data.splitQty,
  );
  if (!split) {
    redirect(`${returnTo}?error=Cantidad+invalida`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: item.id },
        data: { quantity: split.keep.quantity, lineTotal: split.keep.lineTotal },
      });
      await tx.orderItem.create({
        data: {
          orderId: item.orderId,
          productId: item.productId,
          quantity: split.moved.quantity,
          unitPrice: item.unitPrice,
          lineTotal: split.moved.lineTotal,
          fulfillmentMode: item.fulfillmentMode,
          notes: item.notes,
          confirmedSupplierId: item.confirmedSupplierId,
          purchaseCost: item.purchaseCost,
          stockCostSource: item.stockCostSource,
          confirmedAt: item.confirmedAt,
          supplierPaymentStatus: item.supplierPaymentStatus,
        },
      });
    });
  } catch (error) {
    console.error("Failed to split order item:", error);
    redirect(`${returnTo}?error=No+se+pudo+separar+el+producto`);
  }

  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: item.order.id,
    summary: `Separó ${split.moved.quantity} de ${item.quantity} unidades de ${item.product.name} en la orden ${item.order.code}`,
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${item.order.id}`);
  redirect(`${returnTo}?ok=Unidades+separadas`);
}
