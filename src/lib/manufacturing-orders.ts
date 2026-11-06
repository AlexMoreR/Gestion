import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { imagenesDeLaLinea } from "./of-image";
import { textoColores } from "./product-parts";
import { stableShareToken } from "@/lib/manufacturing-share-token";
import { colombiaDayKey } from "./colombia-time";
import { displayCode } from "./code-display";
import { resumenCambioFechaOf } from "./delivery-tracking";
import { computeOfBalance, type OfBalance } from "../modules/proveedores/domain/supplier-payment";

// Ordenes de fabricacion (OF-00001): una por orden de venta + proveedora.

export type ManufacturingLine = {
  id: string;
  productName: string;
  productCode: string | null;
  imageUrl: string;
  // La imagen es la de colores (va con su dirección directa: no tiene versiones reducidas).
  imagenDeColores: boolean;
  // Imagen subida a mano por el admin cuando la principal es la de colores ("" = no hay otra que mostrar).
  imagenReferenciaUrl: string;
  // 'Tapizado: Crema · Base: Dorada' si la línea tiene partes; "" si no.
  partesTexto: string;
  quantity: number;
  // Especificaciones / medidas escritas en la cotizacion (o la descripcion del producto).
  details: string;
  color: string;
  // Color de la carta del CRM (vacios si el color se escribio a mano).
  colorCodigo: string;
  colorMaterial: string;
  colorFotoUrl: string;
  comboName: string;
  unitCost: number | null;
  subtotal: number | null;
};

type OrderItemForLine = {
  id: string;
  quantity: number;
  purchaseCost: Prisma.Decimal | number | null;
  notes: string | null;
  product: { name: string; code: string | null; thumbnailUrl: string; description: string | null };
};

export function toManufacturingLine(item: OrderItemForLine): ManufacturingLine {
  const meta = parseQuoteItemMeta(item.notes);
  const unitCost = item.purchaseCost == null ? null : Number(item.purchaseCost);
  const imagenes = imagenesDeLaLinea(meta, item.product.thumbnailUrl);
  return {
    id: item.id,
    productName: item.product.name,
    productCode: item.product.code,
    imageUrl: imagenes.principal,
    imagenDeColores: imagenes.principalEsColores,
    imagenReferenciaUrl: imagenes.referencia,
    partesTexto: meta.partes.length > 0 ? textoColores(meta.partes) : "",
    quantity: item.quantity,
    details: meta.description.trim() || item.product.description?.trim() || "",
    color: meta.color.trim(),
    colorCodigo: meta.colorCodigo.trim(),
    colorMaterial: meta.colorMaterial.trim(),
    colorFotoUrl: meta.colorFotoUrl.trim(),
    comboName: meta.comboName.trim(),
    unitCost,
    subtotal: unitCost == null ? null : unitCost * item.quantity,
  };
}

// Productos de una orden que se le encargaron a una proveedora (fabricacion).
export function isManufacturingItem(item: { confirmedSupplierId: string | null; fulfillmentMode: string }): boolean {
  return Boolean(item.confirmedSupplierId) && item.fulfillmentMode !== "STOCK";
}

// Fecha real automática de la OF: todos los productos de esa proveedora están en algún despacho vivo
// (ni cancelado ni devuelto). Sin productos de la proveedora no hay nada recibido: falso.
export function ofTodaDespachada(
  supplierId: string,
  items: Array<{ confirmedSupplierId: string | null; fulfillmentMode: string; dispatchStatuses: string[] }>,
): boolean {
  const propios = items.filter((item) => isManufacturingItem(item) && item.confirmedSupplierId === supplierId);
  return (
    propios.length > 0 &&
    propios.every((item) => item.dispatchStatuses.some((status) => status !== "CANCELLED" && status !== "RETURNED"))
  );
}

// Dentro de la transacción del despacho: marca recibida (ahora) cada OF sin fecha real cuya proveedora ya
// despachó todo. Deshacer un despacho no la borra (se corrige a mano); las fotos de embalaje no cuentan.
export async function marcarOfRecibidasSiDespachadas(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const pendientes = await tx.manufacturingOrder.findMany({
    where: { orderId, receivedAt: null },
    select: { id: true, code: true, supplierId: true },
  });
  if (pendientes.length === 0) return;
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      confirmedSupplierId: true,
      fulfillmentMode: true,
      dispatchItems: { select: { dispatch: { select: { status: true } } } },
    },
  });
  const conEstados = items.map((item) => ({
    confirmedSupplierId: item.confirmedSupplierId,
    fulfillmentMode: item.fulfillmentMode,
    dispatchStatuses: item.dispatchItems.map((row) => row.dispatch.status),
  }));
  const ahora = new Date();
  for (const of of pendientes) {
    if (!ofTodaDespachada(of.supplierId, conEstados)) continue;
    // receivedAt: null en el where: si dos despachos llegan a la vez, solo uno la marca y la anota.
    const { count } = await tx.manufacturingOrder.updateMany({
      where: { id: of.id, receivedAt: null },
      data: { receivedAt: ahora },
    });
    if (count === 0) continue;
    await tx.activityLog.create({
      data: {
        actorId: null,
        actorName: "Automático (al despachar)",
        action: "UPDATE",
        entityType: "ORDER",
        entityId: orderId,
        entityCode: of.code,
        summary: resumenCambioFechaOf(displayCode(of.code), { real: { antes: null, despues: ahora } }).slice(0, 500),
        before: { receivedAt: null },
        after: { receivedAt: ahora.toISOString() },
        origin: "PANTALLA",
      },
    });
  }
}

// Direccion de despacho sugerida: la del cliente, SIN nombre ni telefono.
export function suggestDeliveryAddress(client: {
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  department: string | null;
} | null): string {
  if (!client) return "";
  return [client.address, client.neighborhood, client.city, client.department]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

// Ciudad de destino para la proveedora: solo ciudad y departamento, nunca la direccion ni el barrio.
export function destinationCityLabel(
  client: { city?: string | null; department?: string | null } | null | undefined,
): string | null {
  const label = [client?.city?.trim(), client?.department?.trim()].filter(Boolean).join(", ");
  return label || null;
}

// Cómo se le paga a la proveedora, según la forma de pago de la venta. Sin venta o sin definir: por confirmar.
export function supplierPaymentLabel(paymentMethod: string | null | undefined): string {
  if (paymentMethod === "ANTICIPO_50_50" || paymentMethod === "PAGO_TOTAL") return "Pago: se te paga de una vez";
  if (paymentMethod === "CONTRAENTREGA") return "Pago: contraentrega, se te paga cuando el producto le llegue al cliente";
  return "Pago: por confirmar";
}

async function nextManufacturingCode(): Promise<string> {
  const last = await prisma.manufacturingOrder.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNumber = last ? Number(last.code.replace(/\D/g, "")) || 0 : 0;
  return `OF-${String(lastNumber + 1).padStart(5, "0")}`;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Garantiza que exista una OF por cada proveedora con productos en la orden.
// Idempotente y segura ante aperturas simultaneas (reintenta si el numero choca).
export async function ensureManufacturingOrders(orderId: string, supplierIds: string[]) {
  const uniqueSupplierIds = Array.from(new Set(supplierIds.filter(Boolean)));
  if (uniqueSupplierIds.length === 0) {
    return [];
  }

  const existing = await prisma.manufacturingOrder.findMany({
    where: { orderId, supplierId: { in: uniqueSupplierIds } },
  });
  const existingSupplierIds = new Set(existing.map((record) => record.supplierId));

  // La cotizacion es la identidad logica estable del pedido: sobrevive a que se
  // borre la venta y se reconvierta (y es la misma al editar la cotizacion).
  // Si no hay cotizacion (no deberia pasar en ordenes de venta con OF), se cae
  // al token aleatorio de siempre.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { quoteId: true },
  });
  const quoteId = order?.quoteId ?? null;

  for (const supplierId of uniqueSupplierIds) {
    if (existingSupplierIds.has(supplierId)) continue;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // Primer intento: token estable derivado de (cotizacion, proveedora). Si
      // chocara (caso extremo: ya existe esa OF para OTRO pedido vivo), los
      // reintentos usan un token aleatorio para no bloquear la creacion.
      const shareToken =
        attempt === 0 && quoteId
          ? stableShareToken(quoteId, supplierId)
          : randomBytes(24).toString("base64url");
      try {
        await prisma.manufacturingOrder.create({
          data: {
            code: await nextManufacturingCode(),
            orderId,
            supplierId,
            shareToken,
          },
        });
        break;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Otra peticion ya la creo (misma orden+proveedora): no hay nada que hacer.
        const alreadyCreated = await prisma.manufacturingOrder.findUnique({
          where: { orderId_supplierId: { orderId, supplierId } },
          select: { id: true },
        });
        if (alreadyCreated) break;
        // Si choco el numero OF (o el token), se reintenta.
      }
    }
  }

  return prisma.manufacturingOrder.findMany({
    where: { orderId, supplierId: { in: uniqueSupplierIds } },
    orderBy: { code: "asc" },
  });
}

export type ManufacturingPayment = {
  id: string;
  amount: number;
  date: string; // AAAA-MM-DD (fecha del pago, o de registro si es viejo)
  accountName: string | null;
  note: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
};

export type ManufacturingPaymentSummary = OfBalance & { pagos: ManufacturingPayment[] };

// Pagado y Falta de cada OF: lee cargos y abonos de la cuenta de la proveedora en esa orden
// (mismo filtro orderId + supplierId que usa Proveedores). Solo lectura.
export async function getManufacturingPayments(
  orderId: string,
  supplierIds: string[],
  lineSubtotalsBySupplier: Map<string, Array<number | null>> = new Map(),
): Promise<Map<string, ManufacturingPaymentSummary>> {
  const uniqueSupplierIds = Array.from(new Set(supplierIds.filter(Boolean)));
  const result = new Map<string, ManufacturingPaymentSummary>();
  if (uniqueSupplierIds.length === 0) return result;

  const entries = await prisma.supplierLedgerEntry.findMany({
    where: { orderId, supplierId: { in: uniqueSupplierIds }, type: { in: ["CHARGE", "PAYMENT"] } },
    select: {
      id: true,
      supplierId: true,
      type: true,
      amount: true,
      paymentDate: true,
      createdAt: true,
      note: true,
      receiptUrl: true,
      receiptName: true,
      account: { select: { name: true } },
    },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });

  for (const supplierId of uniqueSupplierIds) {
    const own = entries.filter((entry) => entry.supplierId === supplierId);
    const payments = own.filter((entry) => entry.type === "PAYMENT");
    const balance = computeOfBalance({
      charges: own.filter((entry) => entry.type === "CHARGE").map((entry) => Number(entry.amount)),
      payments: payments.map((entry) => Number(entry.amount)),
      lineSubtotals: lineSubtotalsBySupplier.get(supplierId) ?? [],
    });
    result.set(supplierId, {
      ...balance,
      pagos: payments.map((entry) => ({
        id: entry.id,
        amount: Number(entry.amount),
        date: colombiaDayKey(entry.paymentDate ?? entry.createdAt),
        accountName: entry.account?.name ?? null,
        note: entry.note,
        receiptUrl: entry.receiptUrl,
        receiptName: entry.receiptName,
      })),
    });
  }
  return result;
}
