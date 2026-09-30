import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";

// Ordenes de fabricacion (OF-00001): una por orden de venta + proveedora.

export type ManufacturingLine = {
  id: string;
  productName: string;
  productCode: string | null;
  imageUrl: string;
  quantity: number;
  // Especificaciones / medidas escritas en la cotizacion (o la descripcion del producto).
  details: string;
  color: string;
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
  return {
    id: item.id,
    productName: item.product.name,
    productCode: item.product.code,
    imageUrl: meta.imageUrl || item.product.thumbnailUrl,
    quantity: item.quantity,
    details: meta.description.trim() || item.product.description?.trim() || "",
    color: meta.color.trim(),
    comboName: meta.comboName.trim(),
    unitCost,
    subtotal: unitCost == null ? null : unitCost * item.quantity,
  };
}

// Productos de una orden que se le encargaron a una proveedora (fabricacion).
export function isManufacturingItem(item: { confirmedSupplierId: string | null; fulfillmentMode: string }): boolean {
  return Boolean(item.confirmedSupplierId) && item.fulfillmentMode !== "STOCK";
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

  for (const supplierId of uniqueSupplierIds) {
    if (existingSupplierIds.has(supplierId)) continue;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await prisma.manufacturingOrder.create({
          data: {
            code: await nextManufacturingCode(),
            orderId,
            supplierId,
            shareToken: randomBytes(24).toString("base64url"),
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
        // Si choco el numero OF, se reintenta con el siguiente.
      }
    }
  }

  return prisma.manufacturingOrder.findMany({
    where: { orderId, supplierId: { in: uniqueSupplierIds } },
    orderBy: { code: "asc" },
  });
}
