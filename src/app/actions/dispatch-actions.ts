"use server";

import { hasAnyModuleAccess } from "@/lib/admin-module-access";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, type OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildDispatchCode, parseDispatchCodeNumber } from "@/lib/orders";
import { isOrderFullyDelivered } from "@/lib/order-partial-delivery";
import { parseWeightKg } from "@/modules/guias/domain/weight";
import {
  buildShippingLegs,
  distributeAmount,
  extraLegShippingReference,
  legacyDispatchLeg,
  legPaymentError,
  MAX_EXTRA_SHIPPING_LEGS,
  parseExtraShippingLegs,
  sumShippingLegs,
  type ExtraShippingLegInput,
  type ShippingLeg,
} from "@/lib/dispatch-shipping-legs";
import {
  createShipmentForDispatch,
  ShipmentError,
  syncShipmentFromDispatch,
} from "@/modules/guias/infrastructure/shipments-repository";
import { displayCode } from "@/lib/code-display";

// Check "Crear guia Magilus" del modal de despacho (solo envios con transportadora). Si la
// guia falla, el despacho ya quedo creado: se avisa en el mensaje y se crea luego desde la orden.
// Cierra la orden (COMPLETED) solo si cada unidad ya está en un despacho entregado;
// si falta algo queda DISPATCHED con la nota "Entrega parcial". Va dentro de la
// misma transacción que marcó el despacho como entregado.
async function closeOrderIfFullyDelivered(
  tx: Prisma.TransactionClient,
  input: { orderId: string; fromStatus: OrderStatus; note: string; changedById: string },
) {
  const items = await tx.orderItem.findMany({
    where: { orderId: input.orderId },
    select: {
      quantity: true,
      dispatchItems: { select: { quantity: true, dispatch: { select: { status: true } } } },
    },
  });
  const complete = isOrderFullyDelivered(items);
  const toStatus = complete ? "COMPLETED" : "DISPATCHED";

  await tx.order.update({
    where: { id: input.orderId },
    data: complete ? { status: toStatus, completedAt: new Date() } : { status: toStatus },
  });
  await tx.orderStatusHistory.create({
    data: {
      orderId: input.orderId,
      fromStatus: input.fromStatus,
      toStatus,
      note: complete ? input.note : `Entrega parcial. ${input.note}`,
      changedById: input.changedById,
    },
  });
}

async function createShipmentIfRequested(
  formData: FormData,
  dispatchCode: string | null,
  createdById: string,
  isShipping: boolean,
): Promise<string> {
  if (!dispatchCode || !isShipping || formData.get("createShipment") !== "on") {
    return "";
  }
  const created = await prisma.dispatch.findUnique({ where: { code: dispatchCode }, select: { id: true } });
  if (!created) {
    return "";
  }
  const dispatchId = created.id;
  const cityRaw = formData.get("destinationCityId");
  const amountRaw = formData.get("amountToCollect");
  const amount = typeof amountRaw === "string" && amountRaw.trim() ? Number(amountRaw.replace(/[^\d.]/g, "")) : NaN;
  // Peso opcional: si viene mal escrito la guia se crea igual sin peso y se avisa.
  const weight = parseWeightKg(formData.get("weightKg"));
  try {
    const shipment = await createShipmentForDispatch({
      dispatchId,
      createdById,
      destinationCityId: typeof cityRaw === "string" && cityRaw.trim() ? cityRaw.trim() : null,
      amountToCollect: Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null,
      weightKg: weight.ok ? weight.value : null,
    });
    revalidatePath("/admin/despachos/guias");
    return ` · Guía ${shipment.code} creada${weight.ok ? "" : " (peso inválido: agrégalo en la guía)"}`;
  } catch (error) {
    if (!(error instanceof ShipmentError)) {
      console.error("Failed to create shipment:", error);
    }
    return " · No se pudo crear la guía Magilus (créala desde la orden)";
  }
}

const RECEIPT_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_RECEIPT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

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

      await closeOrderIfFullyDelivered(tx, {
        orderId: dispatch.orderId,
        fromStatus: dispatch.order.status,
        note: parsed.data.note || "Pedido entregado al cliente",
        changedById,
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

  await syncShipmentFromDispatch(dispatch.id, "DELIVERED", changedById);

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
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["dispatches", "orders"]))) {
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

type ResolvedExtraLeg = ExtraShippingLegInput & { carrierName: string };

// Tramos de envio ADICIONALES del modal de despacho (ej. la llegada a Cali con otro
// transportador). Valida que cada proveedor exista; si algo falla, corta con mensaje.
async function resolveExtraShippingLegs(
  formData: FormData,
  returnTo: string,
  isShipping: boolean,
): Promise<ResolvedExtraLeg[]> {
  if (!isShipping) {
    return [];
  }
  const { legs, error } = parseExtraShippingLegs(formData.get("extraShippingLegs"));
  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error)}`);
  }
  if (legs.length === 0) {
    return [];
  }
  const ids = [...new Set(legs.map((leg) => leg.carrierSupplierId))];
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  if (ids.some((id) => !nameById.has(id))) {
    redirect(`${returnTo}?error=Proveedor+de+envio+no+encontrado`);
  }
  return legs.map((leg) => ({ ...leg, carrierName: nameById.get(leg.carrierSupplierId) ?? "" }));
}

type LegPaymentInput = { accountId: string | null; file: File | null };
type PaidShippingLeg = ShippingLeg & { accountId: string | null; receipt: { url: string; name: string } | null };

function textOrNull(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fileOrNull(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

// Pago de cada tramo que manda el modal: el principal usa "accountId" + "shippingReceipt"; cada
// tramo adicional trae su cuenta y el nombre de su campo de comprobante. Mismo orden que los tramos.
function readLegPayments(formData: FormData, extraLegs: ResolvedExtraLeg[]): LegPaymentInput[] {
  return [
    { accountId: textOrNull(formData.get("accountId")), file: fileOrNull(formData.get("shippingReceipt")) },
    ...extraLegs.map((leg) => ({
      accountId: leg.accountId,
      file: leg.receiptField ? fileOrNull(formData.get(leg.receiptField)) : null,
    })),
  ];
}

// Al transportador se le paga de una (decision del dueno, 30-oct-2026): cada tramo con valor
// exige la cuenta de donde salio la plata y el comprobante (salvo efectivo). Si falta algo, no
// se crea el despacho y la orden no pasa a DESPACHADO.
async function assertLegPayments(
  legs: { amount: number }[],
  payments: LegPaymentInput[],
  returnTo: string,
): Promise<void> {
  const ids = [...new Set(payments.map((payment) => payment.accountId).filter((id): id is string => Boolean(id)))];
  const accounts = ids.length
    ? await prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true, type: true } })
    : [];
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  for (const [index, leg] of legs.entries()) {
    const payment = payments[index] ?? { accountId: null, file: null };
    const error = legPaymentError(
      { amount: leg.amount, accountId: payment.accountId, hasReceipt: Boolean(payment.file) },
      payment.accountId ? accountById.get(payment.accountId) : null,
    );
    if (error) {
      const label = legs.length > 1 ? `Tramo ${index + 1}: ${error}` : error;
      redirect(`${returnTo}?error=${encodeURIComponent(label)}`);
    }
  }
}

// Guarda el comprobante de cada tramo con valor y arma los tramos listos para registrar.
async function saveLegPayments(
  legs: ShippingLeg[],
  payments: LegPaymentInput[],
  orderId: string,
): Promise<PaidShippingLeg[]> {
  const paid: PaidShippingLeg[] = [];
  for (const [index, leg] of legs.entries()) {
    const payment = leg.amount > 0 ? payments[index] : undefined;
    const receipt = payment?.file ? await saveShippingReceipt(payment.file, orderId) : null;
    paid.push({ ...leg, accountId: payment?.accountId ?? null, receipt });
  }
  return paid;
}

// Registra los tramos del envio de un despacho y sus efectos de dinero, tramo por tramo:
// - Cargo (CHARGE) y pago (PAYMENT) en la cuenta corriente del transportador de ese tramo: se le
//   paga de una, con la cuenta y el comprobante. El pago es lo UNICO que resta del saldo de la cuenta.
// - ShippingCost de la venta (resta de la utilidad) enlazado a ese pago y sin cuenta propia, para
//   no restar dos veces del saldo.
// - DispatchShippingLeg (detalle visible en la orden y en Despachos) con su pago.
// - En ordenes de COMPRA el flete total se suma al total de la orden.
async function recordDispatchShippingLegs(
  tx: Prisma.TransactionClient,
  input: {
    legs: PaidShippingLeg[];
    dispatch: { id: string; code: string };
    order: { id: string; code: string; saleId: string | null; type: string };
    createdById: string;
    mainReference: string;
  },
): Promise<void> {
  const { legs, dispatch, order, createdById, mainReference } = input;
  let total = 0;

  for (const leg of legs) {
    const isMain = leg.position === 0;
    const hasPayment = Boolean(leg.carrierSupplierId) && leg.amount > 0;
    let paymentId: string | null = null;

    if (hasPayment && leg.carrierSupplierId) {
      total += leg.amount;
      // 1) Cuenta corriente del transportador: lo que cobra y el pago que se le hizo.
      await tx.supplierLedgerEntry.create({
        data: {
          supplierId: leg.carrierSupplierId,
          type: "CHARGE",
          amount: leg.amount,
          note: isMain
            ? `Envio - Despacho ${dispatch.code} (Orden ${order.code})`
            : `Envio tramo ${leg.position + 1} - Despacho ${dispatch.code} (Orden ${order.code})`,
          saleId: order.saleId,
          orderId: order.id,
          dispatchId: dispatch.id,
          createdById,
        },
      });
      const payment = await tx.supplierLedgerEntry.create({
        data: {
          supplierId: leg.carrierSupplierId,
          type: "PAYMENT",
          amount: leg.amount,
          note: isMain
            ? `Pago envio - Despacho ${dispatch.code}`
            : `Pago envio tramo ${leg.position + 1} - Despacho ${dispatch.code}`,
          saleId: order.saleId,
          orderId: order.id,
          dispatchId: dispatch.id,
          paymentDate: new Date(),
          accountId: leg.accountId,
          receiptUrl: leg.receipt?.url ?? null,
          receiptName: leg.receipt?.name ?? null,
          createdById,
        },
        select: { id: true },
      });
      paymentId = payment.id;

      // 2) Modulo balances: el envio es gasto de la venta. Una compra no es venta.
      if (order.type !== "PURCHASE" && order.saleId) {
        await tx.shippingCost.create({
          data: {
            saleId: order.saleId,
            shippingProvider: leg.carrierName,
            amount: leg.amount,
            transactionReference: isMain ? mainReference : extraLegShippingReference(dispatch.code, leg.position),
            paymentDate: new Date(),
            // Sin cuenta propia: el pago enlazado es el que resta del saldo.
            accountId: null,
            supplierPaymentId: paymentId,
            createdById,
          },
        });
      }
    }

    await tx.dispatchShippingLeg.create({
      data: {
        dispatchId: dispatch.id,
        position: leg.position,
        carrierSupplierId: leg.carrierSupplierId,
        carrierName: leg.carrierName,
        amount: leg.amount,
        trackingNumber: leg.trackingNumber,
        note: leg.note,
        supplierPaymentId: paymentId,
      },
    });
  }

  // En ordenes de COMPRA el flete es parte del costo: se suma al total.
  if (order.type === "PURCHASE" && total > 0) {
    await tx.order.update({
      where: { id: order.id },
      data: { total: { increment: total } },
    });
  }
}

const dispatchOrderItemSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  orderItemId: z.string().trim().min(1, "Producto invalido"),
  deliveryType: z.enum(["COUNTER", "PICKUP", "SHIPPING"]).default("SHIPPING"),
  carrierSupplierId: z.string().trim().optional(),
  shippingCost: z.coerce.number().nonnegative("Costo de envio invalido"),
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
  // Otros proveedores de envio del mismo despacho (tramos adicionales).
  const extraLegs = await resolveExtraShippingLegs(formData, returnTo, isShipping);

  const legPayments = readLegPayments(formData, extraLegs);

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

  // En una compra el item ya viene comprado, y un producto de stock ya esta en
  // bodega: no exigen proveedor, foto ni pago (el de stock solo debe estar
  // confirmado, es decir descontado del inventario).
  const isPurchaseOrder = order.type === "PURCHASE";
  const isStockItem = item.fulfillmentMode === "STOCK";
  if (!isPurchaseOrder && isStockItem && item.confirmedAt === null) {
    redirect(`${returnTo}?error=Confirma+la+salida+de+stock+antes+de+despachar`);
  }
  const skipSupplierFlow = isPurchaseOrder || isStockItem;
  if (!skipSupplierFlow && (!item.confirmedSupplierId || item.purchaseCost === null)) {
    redirect(`${returnTo}?error=Confirma+el+proveedor+y+costo+del+producto+antes+de+despachar`);
  }
  if (!skipSupplierFlow && item.photos.length === 0) {
    redirect(`${returnTo}?error=Sube+al+menos+una+foto+del+producto+terminado`);
  }
  if (!skipSupplierFlow && item.supplierPaymentStatus === null) {
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

  // Tramos del envio: la transportadora principal + los adicionales (suma = valor del envio).
  const legs =
    isShipping && carrier
      ? buildShippingLegs(
          {
            carrierSupplierId: carrier.id,
            carrierName: carrier.name,
            amount: parsed.data.shippingCost,
            trackingNumber: parsed.data.trackingNumber || null,
          },
          extraLegs,
        )
      : [];
  const shippingCost = isShipping ? sumShippingLegs(legs) : 0;
  await assertLegPayments(legs, legPayments, returnTo);
  let createdDispatchCode: string | null = null;

  try {
    const paidLegs = await saveLegPayments(legs, legPayments, order.id);
    const receipt = paidLegs[0]?.receipt ?? null;

    let trackingPhoto: { url: string; name: string } | null = null;
    if (isShipping && hasTrackingPhoto) {
      trackingPhoto = await saveTrackingPhoto(trackingPhotoFile, order.id);
    }

    await prisma.$transaction(async (tx) => {
      const code = await getNextDispatchCode(tx);
      createdDispatchCode = code;
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

      // Costo de envio por tramo: gasto de la venta y cargo a cada transportador.
      await recordDispatchShippingLegs(tx, {
        legs: paidLegs,
        dispatch,
        order,
        createdById,
        mainReference: receipt?.name ?? parsed.data.trackingNumber ?? `Despacho ${dispatch.code}`,
      });

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
  const shipmentNote = await createShipmentIfRequested(formData, createdDispatchCode, createdById, isShipping);
  redirect(`${returnTo}?ok=${encodeURIComponent(`Producto despachado${shipmentNote}`)}`);
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
  // Otros proveedores de envio del mismo despacho (tramos adicionales).
  const extraLegs = await resolveExtraShippingLegs(formData, returnTo, isShipping);

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

  // En una compra los items ya vienen comprados, y los de stock ya estan en
  // bodega: no exigen proveedor, foto ni pago (los de stock solo deben estar
  // confirmados, es decir descontados del inventario).
  const isPurchaseOrder = order.type === "PURCHASE";
  for (const item of selectedItems) {
    if (!isPurchaseOrder && item.fulfillmentMode === "STOCK") {
      if (item.confirmedAt === null) {
        redirect(`${returnTo}?error=Confirma+la+salida+de+stock+de+todos+los+productos+antes+de+despachar`);
      }
      continue;
    }
    if (!isPurchaseOrder) {
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
  // Tramo principal = la transportadora elegida con su costo (por producto o plano); luego los
  // tramos adicionales. El valor del envio del despacho es la suma de todos.
  const legs =
    isShipping && carrier
      ? buildShippingLegs(
          {
            carrierSupplierId: carrier.id,
            carrierName: carrier.name,
            amount: hasPerItemCosts ? perItemTotal : parsed.data.shippingCost,
            trackingNumber: null,
          },
          extraLegs,
        )
      : [];
  const shippingCost = isShipping ? sumShippingLegs(legs) : 0;
  // Reparto por producto (DispatchItem.shippingCost): lo digitado por producto + los tramos
  // adicionales repartidos en la misma proporcion, para que la suma = valor total del envio.
  const itemShippingCosts = new Map<string, number>();
  if (hasPerItemCosts) {
    const extraTotal = shippingCost - perItemTotal;
    const extraShares = distributeAmount(
      selectedItems.map((item) => ({ id: item.id, quantity: item.quantity, weight: perItemCosts.get(item.id) ?? 0 })),
      extraTotal > 0 ? extraTotal : 0,
    );
    for (const item of selectedItems) {
      itemShippingCosts.set(item.id, (perItemCosts.get(item.id) ?? 0) + (extraShares.get(item.id) ?? 0));
    }
  }

  const legPayments = readLegPayments(formData, extraLegs);
  await assertLegPayments(legs, legPayments, returnTo);

  const trackingPhotoFile = formData.get("trackingPhoto");
  const hasTrackingPhoto = trackingPhotoFile instanceof File && trackingPhotoFile.size > 0;
  let createdDispatchCode: string | null = null;

  try {
    const paidLegs = await saveLegPayments(legs, legPayments, order.id);
    const receipt = paidLegs[0]?.receipt ?? null;
    let trackingPhoto: { url: string; name: string } | null = null;
    if (isShipping && hasTrackingPhoto) {
      trackingPhoto = await saveTrackingPhoto(trackingPhotoFile, order.id);
    }

    await prisma.$transaction(async (tx) => {
      const code = await getNextDispatchCode(tx);
      createdDispatchCode = code;
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
              shippingCost: itemShippingCosts.get(item.id) ?? 0,
            })),
          },
        },
      });

      // Costo de envio por tramo: gasto de la venta y cargo a cada transportador.
      await recordDispatchShippingLegs(tx, {
        legs: paidLegs,
        dispatch,
        order,
        createdById,
        mainReference: receipt?.name ?? trackingPhoto?.name ?? `Despacho ${dispatch.code}`,
      });

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
  const shipmentNote = await createShipmentIfRequested(formData, createdDispatchCode, createdById, isShipping);
  redirect(`${returnTo}?ok=${encodeURIComponent(`Despachados ${selectedItems.length} productos${shipmentNote}`)}`);
}

const undoDispatchItemSchema = z.object({
  orderItemId: z.string().trim().min(1, "Producto invalido"),
});

// Deshace el despacho de un producto: elimina el despacho al que pertenece
// (devolviendo todos sus productos a "Recogido") y revierte sus efectos
// financieros (cargo a la transportadora, costo de envio de la venta y, en
// compras, el incremento del total). Util cuando se despacho por error.
export async function adminUndoDispatchItemAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = undoDispatchItemSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Producto+invalido`);
  }

  // Despacho activo (no cancelado ni devuelto) que contiene este producto.
  const dispatchItem = await prisma.dispatchItem.findFirst({
    where: {
      orderItemId: parsed.data.orderItemId,
      dispatch: { status: { notIn: ["CANCELLED", "RETURNED"] } },
    },
    include: {
      dispatch: {
        include: {
          order: { select: { id: true, saleId: true, type: true, status: true } },
          shippingLegs: { select: { position: true } },
        },
      },
    },
  });

  if (!dispatchItem) {
    redirect(`${returnTo}?error=El+producto+no+tiene+un+despacho+activo`);
  }

  const dispatch = dispatchItem.dispatch;
  const order = dispatch.order;

  // Se permite deshacer aunque la orden ya este entregada/cerrada: se revierte
  // el despacho y la orden vuelve a "Lista para despacho".

  const shippingCost = Math.round(Number(dispatch.shippingCost ?? 0));

  // Referencias con las que se pudo haber registrado el costo de envio de la venta.
  const shippingRefs = [
    dispatch.shippingReceiptName,
    dispatch.trackingNumber,
    dispatch.trackingPhotoName,
    `Despacho ${dispatch.code}`,
    // Tramos adicionales (otros proveedores de envio del mismo despacho).
    ...dispatch.shippingLegs
      .filter((leg) => leg.position > 0)
      .map((leg) => extraLegShippingReference(dispatch.code, leg.position)),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Revertir el costo de envio registrado como gasto de la venta (por referencia o por
      //    estar enlazado a un pago de este despacho). Va antes de borrar los pagos.
      if (order.saleId) {
        await tx.shippingCost.deleteMany({
          where: {
            saleId: order.saleId,
            OR: [
              { transactionReference: { in: shippingRefs } },
              { supplierPayment: { dispatchId: dispatch.id } },
            ],
          },
        });
      }

      // 2) Revertir movimientos de la cuenta corriente de la transportadora (cargos y pagos).
      await tx.supplierLedgerEntry.deleteMany({ where: { dispatchId: dispatch.id } });

      // 3) En compras, el flete se sumo al total: se descuenta.
      if (order.type === "PURCHASE" && shippingCost > 0) {
        await tx.order.update({
          where: { id: order.id },
          data: { total: { decrement: shippingCost } },
        });
      }

      // 4) Eliminar el despacho (cascade borra sus DispatchItem).
      await tx.dispatch.delete({ where: { id: dispatch.id } });

      // 5) Si la orden estaba despachada o entregada, vuelve a "Lista para
      //    despacho" (y se limpia la fecha de completado si estaba cerrada).
      if (order.status === "DISPATCHED" || order.status === "COMPLETED") {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "READY_FOR_DISPATCH",
            ...(order.status === "COMPLETED" ? { completedAt: null } : {}),
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "READY_FOR_DISPATCH",
            note: `Despacho ${dispatch.code} deshecho`,
            changedById,
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to undo dispatch item:", error);
    redirect(`${returnTo}?error=No+se+pudo+deshacer+el+despacho`);
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${order.id}`);
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?ok=Despacho+deshecho`);
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
      await closeOrderIfFullyDelivered(tx, {
        orderId: dispatch.orderId,
        fromStatus: dispatch.order.status,
        note: parsed.data.note || "Pedido entregado",
        changedById,
      });
    }
  });

  await syncShipmentFromDispatch(dispatch.id, parsed.data.status, changedById);

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
    select: {
      id: true,
      shippingCost: true,
      order: { select: { type: true } },
      items: { select: { id: true, quantity: true, orderItem: { select: { productId: true } } } },
    },
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

  // En ordenes de COMPRA, el flete asignado a cada item se capitaliza como costo
  // adicional (por unidad) del producto, para que el margen de venta sea real.
  // Se fija (no se acumula), asi recalcular el reparto deja el valor correcto.
  if (dispatch.order?.type === "PURCHASE") {
    const itemById = new Map(dispatch.items.map((item) => [item.id, item]));
    const productUpdates = [];
    for (const update of updates) {
      const item = itemById.get(update.id);
      if (!item?.orderItem || item.quantity <= 0) {
        continue;
      }
      productUpdates.push(
        prisma.product.update({
          where: { id: item.orderItem.productId },
          data: { additionalCost: Math.round(update.shippingCost / item.quantity) },
        }),
      );
    }
    if (productUpdates.length > 0) {
      await prisma.$transaction(productUpdates);
    }
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/productos");
  return { ok: true };
}

const addShippingLegSchema = z.object({
  dispatchId: z.string().trim().min(1, "Despacho invalido"),
  carrierSupplierId: z.string().trim().min(1, "Selecciona el transportador del tramo"),
  amount: z.coerce.number().int("Valor invalido").positive("El valor del tramo debe ser mayor a 0"),
  trackingNumber: z.string().trim().max(120, "Guia demasiado larga").optional(),
  note: z.string().trim().max(250, "Nota demasiado larga").optional(),
});

// "Agregar tramo" en el recuadro Envio de la orden: otro transportador del mismo despacho (ej. uno
// lo trae a Cali y otro lo entrega). Mismas reglas que al despachar: se le paga de una, con cuenta
// y comprobante. El valor se suma al flete del despacho, se reparte entre sus productos y, en
// compras, se suma al total de la orden.
export async function adminAddDispatchShippingLegAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = addShippingLegSchema.safeParse({
    dispatchId: formData.get("dispatchId"),
    carrierSupplierId: formData.get("carrierSupplierId"),
    amount: String(formData.get("amount") ?? "").replace(/[.\s$]/g, ""),
    trackingNumber: formData.get("trackingNumber") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Datos del tramo invalidos";
    redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
  }

  const [dispatch, carrier] = await Promise.all([
    prisma.dispatch.findUnique({
      where: { id: parsed.data.dispatchId },
      select: {
        id: true,
        code: true,
        status: true,
        deliveryType: true,
        carrierSupplierId: true,
        carrierName: true,
        shippingCost: true,
        trackingNumber: true,
        carrierSupplier: { select: { name: true } },
        order: { select: { id: true, code: true, saleId: true, type: true, status: true } },
        shippingLegs: { select: { position: true } },
        items: { select: { id: true, quantity: true, shippingCost: true } },
      },
    }),
    prisma.supplier.findUnique({ where: { id: parsed.data.carrierSupplierId }, select: { id: true, name: true } }),
  ]);
  if (!dispatch) {
    redirect(`${returnTo}?error=Despacho+no+encontrado`);
  }
  if (!carrier) {
    redirect(`${returnTo}?error=Transportador+no+encontrado`);
  }
  if (
    dispatch.deliveryType !== "SHIPPING" ||
    dispatch.status === "CANCELLED" ||
    dispatch.status === "RETURNED" ||
    dispatch.order.status === "CANCELLED"
  ) {
    redirect(`${returnTo}?error=Este+despacho+no+acepta+tramos+de+envio`);
  }
  if (dispatch.shippingLegs.length > MAX_EXTRA_SHIPPING_LEGS) {
    redirect(`${returnTo}?error=Demasiados+tramos+de+envio`);
  }

  const payments: LegPaymentInput[] = [
    { accountId: textOrNull(formData.get("accountId")), file: fileOrNull(formData.get("shippingReceipt")) },
  ];
  await assertLegPayments([{ amount: parsed.data.amount }], payments, returnTo);

  // Despacho viejo sin tramos guardados: su envio de siempre queda como tramo 1 (sin pago nuevo),
  // asi no desaparece de la orden al guardar el tramo agregado.
  const legacy =
    dispatch.shippingLegs.length === 0
      ? legacyDispatchLeg({
          carrierSupplierId: dispatch.carrierSupplierId,
          carrierName: dispatch.carrierName,
          carrierSupplierName: dispatch.carrierSupplier?.name ?? null,
          shippingCost: dispatch.shippingCost === null ? null : Number(dispatch.shippingCost),
          trackingNumber: dispatch.trackingNumber,
        })
      : null;
  const position =
    dispatch.shippingLegs.length > 0
      ? Math.max(...dispatch.shippingLegs.map((leg) => leg.position)) + 1
      : legacy
        ? 1
        : 0;
  const leg: ShippingLeg = {
    position,
    carrierSupplierId: carrier.id,
    carrierName: carrier.name,
    amount: parsed.data.amount,
    trackingNumber: parsed.data.trackingNumber || null,
    note: parsed.data.note || null,
  };
  // El tramo agregado se reparte entre los productos en la proporcion que ya tenian.
  const shares = distributeAmount(
    dispatch.items.map((item) => ({ id: item.id, quantity: item.quantity, weight: Number(item.shippingCost ?? 0) })),
    leg.amount,
  );

  try {
    const [paidLeg] = await saveLegPayments([leg], payments, dispatch.order.id);
    await prisma.$transaction(async (tx) => {
      if (legacy) {
        await tx.dispatchShippingLeg.create({
          data: {
            dispatchId: dispatch.id,
            position: 0,
            carrierSupplierId: legacy.carrierSupplierId,
            carrierName: legacy.carrierName,
            amount: legacy.amount,
            trackingNumber: legacy.trackingNumber,
          },
        });
      }
      await recordDispatchShippingLegs(tx, {
        legs: [paidLeg],
        dispatch,
        order: dispatch.order,
        createdById,
        mainReference: extraLegShippingReference(dispatch.code, leg.position),
      });
      await tx.dispatch.update({
        where: { id: dispatch.id },
        // shippingCost puede ser NULL en despachos viejos: se fija en vez de incrementar.
        data: { shippingCost: Number(dispatch.shippingCost ?? 0) + leg.amount },
      });
      for (const [itemId, share] of shares) {
        if (share !== 0) {
          await tx.dispatchItem.update({ where: { id: itemId }, data: { shippingCost: { increment: share } } });
        }
      }
    });
  } catch (error) {
    console.error("Failed to add dispatch shipping leg:", error);
    redirect(`${returnTo}?error=No+se+pudo+agregar+el+tramo`);
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${dispatch.order.id}`);
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/balances");
  redirect(`${returnTo}?ok=${encodeURIComponent(`Tramo agregado al despacho ${displayCode(dispatch.code)}`)}`);
}

// --- Seguimiento con la transportadora (/admin/despachos/transportadora) ---

const CARRIER_FOLLOWUP_PATH = "/admin/despachos/transportadora";

// Fecha y hora de Colombia en formato "AAAA-MM-DD HH:mm".
function formatBogotaStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const carrierResponseSchema = z.object({
  dispatchId: z.string().trim().min(1, "Despacho invalido"),
  response: z.string().trim().min(1, "Escribe la respuesta").max(500, "Respuesta demasiado larga"),
});

// Registra lo que respondio la transportadora: antepone una linea fechada a las
// notas del despacho ("[AAAA-MM-DD HH:mm] Transportadora: <texto>").
export async function adminLogCarrierResponseAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = carrierResponseSchema.safeParse({
    dispatchId: formData.get("dispatchId"),
    response: formData.get("response"),
  });
  if (!parsed.success) {
    redirect(`${CARRIER_FOLLOWUP_PATH}?error=Escribe+la+respuesta+de+la+transportadora`);
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: parsed.data.dispatchId },
    select: { id: true, notes: true },
  });
  if (!dispatch) {
    redirect(`${CARRIER_FOLLOWUP_PATH}?error=Despacho+no+encontrado`);
  }

  const text = parsed.data.response.replace(/\s+/g, " ");
  const line = `[${formatBogotaStamp(new Date())}] Transportadora: ${text}`;
  const notes = dispatch.notes?.trim() ? `${line}\n${dispatch.notes}` : line;

  await prisma.dispatch.update({ where: { id: dispatch.id }, data: { notes } });

  revalidatePath(CARRIER_FOLLOWUP_PATH);
  revalidatePath("/admin/despachos");
  redirect(`${CARRIER_FOLLOWUP_PATH}?ok=Respuesta+guardada`);
}

// Deshacer entrega (paso "Entregar" de la orden): para un despacho marcado como entregado por
// error. El despacho vuelve a En camino (SHIPPED) sin fecha de entrega, la orden COMPLETED vuelve a
// DISPATCHED con historial, y si tiene guia Magilus vuelve a "En transito" con un evento interno.
export async function adminUndoDeliveryAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");
  const dispatchId = String(formData.get("dispatchId") ?? "").trim();
  if (!dispatchId) {
    redirect(`${returnTo}?error=Despacho+invalido`);
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    include: { order: true },
  });
  if (!dispatch) {
    redirect(`${returnTo}?error=Despacho+no+encontrado`);
  }
  if (dispatch.status !== "DELIVERED") {
    redirect(`${returnTo}?error=El+despacho+no+esta+entregado`);
  }

  const now = new Date();
  const line = `[${formatBogotaStamp(now)}] Entrega deshecha: no se habia entregado.`;
  const notes = dispatch.notes?.trim() ? `${line}\n${dispatch.notes}` : line;

  await prisma.$transaction(async (tx) => {
    await tx.dispatch.update({
      where: { id: dispatch.id },
      data: { status: "SHIPPED", deliveredAt: null, shippedAt: dispatch.shippedAt ?? now, notes },
    });

    if (dispatch.order.status === "COMPLETED") {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: "DISPATCHED", completedAt: null },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: dispatch.orderId,
          fromStatus: "COMPLETED",
          toStatus: "DISPATCHED",
          note: `Entrega deshecha: ${dispatch.code} no se habia entregado`,
          changedById,
        },
      });
    }

    const shipment = await tx.shipment.findUnique({ where: { dispatchId: dispatch.id }, select: { id: true, status: true } });
    if (shipment?.status === "DELIVERED") {
      await tx.shipment.update({ where: { id: shipment.id }, data: { status: "IN_TRANSIT", deliveredAt: null } });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          kind: "STATUS",
          status: "IN_TRANSIT",
          visibleToClient: false,
          actor: "SYSTEM",
          actorUserId: changedById,
          note: "Entrega deshecha desde la orden (no se habia entregado)",
          occurredAt: now,
        },
      });
    }
  });

  revalidatePath("/admin/despachos");
  revalidatePath(CARRIER_FOLLOWUP_PATH);
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${dispatch.orderId}`);
  redirect(`${returnTo}?ok=Entrega+deshecha`);
}

const dispatchTrackingSchema = z.object({
  dispatchId: z.string().trim().min(1, "Despacho invalido"),
  trackingNumber: z.string().trim().min(1, "Escribe la guia").max(120, "Guia demasiado larga"),
});

// Registra la guia (y opcionalmente su foto) cuando la transportadora la envia.
// No cambia el estado del despacho.
export async function adminSetDispatchTrackingAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = dispatchTrackingSchema.safeParse({
    dispatchId: formData.get("dispatchId"),
    trackingNumber: formData.get("trackingNumber"),
  });
  if (!parsed.success) {
    redirect(`${CARRIER_FOLLOWUP_PATH}?error=Escribe+el+numero+de+guia`);
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: parsed.data.dispatchId },
    select: { id: true, orderId: true, status: true },
  });
  if (!dispatch) {
    redirect(`${CARRIER_FOLLOWUP_PATH}?error=Despacho+no+encontrado`);
  }
  if (dispatch.status === "CANCELLED") {
    redirect(`${CARRIER_FOLLOWUP_PATH}?error=El+despacho+esta+cancelado`);
  }

  const photoFile = formData.get("trackingPhoto");
  // La foto de la guia es obligatoria: sin ella no se guarda el numero.
  if (!(photoFile instanceof File) || photoFile.size === 0) {
    redirect(`${CARRIER_FOLLOWUP_PATH}?error=Sube+la+foto+de+la+guia`);
  }

  try {
    const photo = await saveTrackingPhoto(photoFile, dispatch.orderId);
    await prisma.dispatch.update({
      where: { id: dispatch.id },
      data: {
        trackingNumber: parsed.data.trackingNumber,
        ...(photo ? { trackingPhotoUrl: photo.url, trackingPhotoName: photo.name } : {}),
      },
    });
    // La guia del despacho es la del tramo principal.
    await prisma.dispatchShippingLeg.updateMany({
      where: { dispatchId: dispatch.id, position: 0 },
      data: { trackingNumber: parsed.data.trackingNumber },
    });
  } catch (error) {
    console.error("Failed to set dispatch tracking:", error);
    redirect(`${CARRIER_FOLLOWUP_PATH}?error=No+se+pudo+guardar+la+guia`);
  }

  revalidatePath(CARRIER_FOLLOWUP_PATH);
  revalidatePath("/admin/despachos");
  revalidatePath(`/admin/ordenes/${dispatch.orderId}`);
  redirect(`${CARRIER_FOLLOWUP_PATH}?ok=Guia+guardada`);
}

