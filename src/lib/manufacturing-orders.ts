import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import { stableShareToken } from "@/lib/manufacturing-share-token";
import { todayInBogota } from "../modules/equipo/domain/team-member";
import { computeOfBalance, type OfBalance } from "../modules/proveedores/domain/supplier-payment";

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

// Ciudad de destino para la proveedora: solo ciudad y departamento, nunca la direccion ni el barrio.
export function destinationCityLabel(
  client: { city?: string | null; department?: string | null } | null | undefined,
): string | null {
  const label = [client?.city?.trim(), client?.department?.trim()].filter(Boolean).join(", ");
  return label || null;
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
  date: string; // yyyy-MM-dd
  accountName: string | null;
  note: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
};

// Una fecha escrita (AAAA-MM-DD) llega como medianoche UTC; un instante (sin fecha escrita o
// pagos viejos sin fecha de pago) se lleva al dia en Colombia.
function ledgerDay(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : todayInBogota(date);
}

export type ManufacturingPaymentSummary = OfBalance & { pagos: ManufacturingPayment[] };

// Pagado y Falta de cada OF: los mismos cargos y abonos (orden + proveedora) que la cuenta del
// proveedor en /admin/proveedores. lineSubtotals (por proveedora) solo se usa si no hay cargos.
export async function getManufacturingPayments(
  orderId: string,
  supplierIds: string[],
  lineSubtotals: Record<string, Array<number | null>> = {},
): Promise<Map<string, ManufacturingPaymentSummary>> {
  const uniqueSupplierIds = Array.from(new Set(supplierIds.filter(Boolean)));
  const result = new Map<string, ManufacturingPaymentSummary>();
  if (uniqueSupplierIds.length === 0) return result;

  const entries = await prisma.supplierLedgerEntry.findMany({
    where: { orderId, supplierId: { in: uniqueSupplierIds }, type: { in: ["CHARGE", "PAYMENT"] } },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
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
  });

  for (const supplierId of uniqueSupplierIds) {
    const own = entries.filter((entry) => entry.supplierId === supplierId);
    const payments = own.filter((entry) => entry.type === "PAYMENT");
    const balance = computeOfBalance({
      charges: own.filter((entry) => entry.type === "CHARGE").map((entry) => Number(entry.amount)),
      payments: payments.map((entry) => Number(entry.amount)),
      lineSubtotals: lineSubtotals[supplierId] ?? [],
    });
    result.set(supplierId, {
      ...balance,
      pagos: payments.map((entry) => ({
        id: entry.id,
        amount: Number(entry.amount),
        date: ledgerDay(entry.paymentDate ?? entry.createdAt),
        accountName: entry.account?.name ?? null,
        note: entry.note,
        receiptUrl: entry.receiptUrl,
        receiptName: entry.receiptName,
      })),
    });
  }
  return result;
}
