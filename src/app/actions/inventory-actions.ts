"use server";

import { hasAnyModuleAccess } from "@/lib/admin-module-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import {
  InventoryError,
  registerInventoryMovementUseCase,
  updateMinStockUseCase,
} from "@/modules/inventory/application/use-cases";
import {
  inventoryMovementCreateSchema,
  minStockUpdateSchema,
} from "@/modules/inventory/application/schemas";
import { createPrismaInventoryRepository } from "@/modules/inventory/infrastructure/prisma-inventory-repository";
import {
  buildInventoryChargeCode,
  buildOrderCode,
  buildPurchaseCode,
  parseInventoryChargeCodeNumber,
  parseOrderCodeNumber,
  parsePurchaseCodeNumber,
} from "@/lib/orders";
import { getProductPurchaseHistory, type ProductPurchaseRow } from "@/lib/product-purchase-history";
import {
  planPurchaseEdit,
  purchaseEditTotals,
  purchaseStockDeltas,
  type ExistingPurchaseItem,
} from "@/lib/purchase-edit";

const repository = createPrismaInventoryRepository();

// Siguiente número de código de cargo de inventario (INV-00001...), a partir del
// mayor existente. Cada cargo creado debe incrementarlo.
async function getNextInventoryChargeSeq(): Promise<number> {
  const last = await prisma.supplierLedgerEntry.findFirst({
    where: { code: { startsWith: "INV-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  return last?.code ? parseInventoryChargeCodeNumber(last.code) : 0;
}

// Siguiente código de compra (COM-00001...), a partir del mayor existente.
async function getNextPurchaseCode(): Promise<string> {
  const last = await prisma.inventoryMovement.findFirst({
    where: { purchaseCode: { startsWith: "COM-" } },
    orderBy: { purchaseCode: "desc" },
    select: { purchaseCode: true },
  });
  const seq = last?.purchaseCode ? parsePurchaseCodeNumber(last.purchaseCode) : 0;
  return buildPurchaseCode(seq + 1);
}

// Siguiente código de orden (ORD-00001...): las compras comparten esta secuencia.
async function getNextOrderCode(): Promise<string> {
  const last = await prisma.order.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const seq = last?.code ? parseOrderCodeNumber(last.code) : 0;
  return buildOrderCode(seq + 1);
}

function redirectWithError(returnTo: string, message: string): never {
  const query = new URLSearchParams({ error: message }).toString();
  redirect(`${returnTo}?${query}`);
}

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["inventory", "orders"]))) {
    redirect("/unauthorized");
  }

  const byId = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (byId) {
    return byId.id;
  }

  if (session.user.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (byEmail) {
      return byEmail.id;
    }
  }

  redirect("/login");
}

// Carga diferida del historial de compras de un producto (para el modal de producto).
export async function getProductPurchaseHistoryAction(productId: string): Promise<ProductPurchaseRow[]> {
  await requireAdminSession();
  const trimmed = productId.trim();
  if (!trimmed) {
    return [];
  }
  return getProductPurchaseHistory(trimmed);
}

function getReturnTo(formData: FormData, fallback = "/admin/inventario"): string {
  const raw = formData.get("returnTo");
  if (typeof raw !== "string") {
    return fallback;
  }
  const value = raw.trim();
  return value || fallback;
}

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function adminCreateInventoryMovementAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = inventoryMovementCreateSchema.safeParse({
    productId: getStringField(formData, "productId"),
    type: getStringField(formData, "type"),
    quantity: getStringField(formData, "quantity"),
    note: getStringField(formData, "note") || undefined,
    movementDate: getStringField(formData, "movementDate"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  // El combo no maneja stock propio: al comprarlo se reparte el stock a cada
  // componente (cantidad del combo x unidades del componente). El cargo al
  // proveedor se hace una sola vez por el combo (ver mas abajo).
  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: {
      name: true,
      isBundle: true,
      bundleComponents: {
        select: { childId: true, quantity: true, child: { select: { name: true } } },
      },
    },
  });
  if (!product) {
    redirectWithError(returnTo, "Producto no encontrado.");
  }
  const productName = product.name;
  // Para combos: mapa de cada componente al movimiento que se le creo, para
  // poder enlazar el cargo de compra de ese componente a su proveedor.
  const componentMovementByChild = new Map<string, string>();

  let movementId: string;
  try {
    if (product.isBundle) {
      if (parsed.data.type === "ADJUSTMENT") {
        redirectWithError(returnTo, "Un combo no admite ajuste de conteo; usa entrada o salida.");
      }
      const components = product.bundleComponents.filter((component) => component.quantity > 0);
      if (components.length === 0) {
        redirectWithError(returnTo, "El combo no tiene componentes configurados.");
      }

      // Para salidas, valida primero que todos los componentes tengan stock
      // suficiente (los movimientos no son transaccionales entre si).
      if (parsed.data.type === "OUT") {
        for (const component of components) {
          const need = component.quantity * parsed.data.quantity;
          const current = await repository.getCurrentStock(component.childId);
          if (need > current) {
            redirectWithError(
              returnTo,
              `No hay stock suficiente de ${component.child.name}. Disponible: ${current}, requiere ${need}.`,
            );
          }
        }
      }

      const movementIds: string[] = [];
      for (const component of components) {
        const id = await registerInventoryMovementUseCase(repository, {
          productId: component.childId,
          type: parsed.data.type,
          quantity: component.quantity * parsed.data.quantity,
          note: parsed.data.note ?? `Combo ${productName} (x${parsed.data.quantity})`,
          movementDate: parsed.data.movementDate,
          createdById,
        });
        movementIds.push(id);
        componentMovementByChild.set(component.childId, id);
      }
      movementId = movementIds[0];
    } else {
      movementId = await registerInventoryMovementUseCase(repository, {
        productId: parsed.data.productId,
        type: parsed.data.type,
        quantity: parsed.data.quantity,
        note: parsed.data.note ?? null,
        movementDate: parsed.data.movementDate,
        createdById,
      });
    }
  } catch (error) {
    if (error instanceof InventoryError) {
      redirectWithError(returnTo, error.message);
    }
    throw error;
  }

  // Si la compra (entrada/ajuste) se atribuye a un proveedor, genera un cargo
  // (deuda) en su cuenta corriente por el costo de compra.
  if (parsed.data.type === "IN" || parsed.data.type === "ADJUSTMENT") {
    let createdAnyCharge = false;
    // Código secuencial INV-0000X; se incrementa por cada cargo de inventario creado.
    let invSeq = await getNextInventoryChargeSeq();

    // Combo: un cargo por cada componente a su proveedor (precio por producto).
    if (product.isBundle) {
      const componentNameByChild = new Map(
        product.bundleComponents.map((component) => [component.childId, component.child.name]),
      );
      let componentCharges: Array<{ childId: string; supplierId: string; cost: number }> = [];
      const rawComponentCharges = getStringField(formData, "componentCharges");
      if (rawComponentCharges.trim()) {
        try {
          const arr = JSON.parse(rawComponentCharges) as unknown;
          if (Array.isArray(arr)) {
            componentCharges = arr
              .filter(
                (entry): entry is { childId: string; supplierId: string; cost: number } =>
                  Boolean(entry) &&
                  typeof entry === "object" &&
                  typeof (entry as { childId?: unknown }).childId === "string",
              )
              .map((entry) => ({
                childId: entry.childId,
                supplierId: typeof entry.supplierId === "string" ? entry.supplierId.trim() : "",
                cost: Number(entry.cost) || 0,
              }));
          }
        } catch {
          // ignore
        }
      }

      for (const entry of componentCharges) {
        const componentMovementId = componentMovementByChild.get(entry.childId);
        if (!entry.supplierId || entry.cost <= 0 || !componentMovementId) {
          continue;
        }
        const supplier = await prisma.supplier.findFirst({
          where: { id: entry.supplierId, isActive: true },
          select: { id: true },
        });
        if (!supplier) {
          continue;
        }
        await prisma.supplierLedgerEntry.create({
          data: {
            supplierId: supplier.id,
            code: buildInventoryChargeCode((invSeq += 1)),
            type: "CHARGE",
            // entry.cost es el costo por combo del componente; la deuda total es
            // ese costo por la cantidad de combos comprados.
            amount: entry.cost * parsed.data.quantity,
            note: `Compra inventario - ${componentNameByChild.get(entry.childId) ?? "componente"} (Combo ${productName} x${parsed.data.quantity})`,
            paymentDate: parsed.data.movementDate,
            inventoryMovementId: componentMovementId,
            createdById,
          },
        });
        createdAnyCharge = true;
      }
    }

    // Cargo por la compra del producto (productos individuales).
    const supplierId = getStringField(formData, "supplierId").trim();
    const purchaseCost = Number(getStringField(formData, "purchaseCost").replace(/\D/g, "")) || 0;
    if (supplierId && purchaseCost > 0) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, isActive: true },
        select: { id: true },
      });
      if (supplier) {
        await prisma.supplierLedgerEntry.create({
          data: {
            supplierId: supplier.id,
            code: buildInventoryChargeCode((invSeq += 1)),
            type: "CHARGE",
            // purchaseCost es el costo unitario; la deuda total con el proveedor
            // es ese costo por la cantidad comprada.
            amount: purchaseCost * parsed.data.quantity,
            note: `Compra inventario - ${productName} (x${parsed.data.quantity})`,
            paymentDate: parsed.data.movementDate,
            inventoryMovementId: movementId,
            createdById,
          },
        });
        createdAnyCharge = true;
      }
    }

    // Cargo por costo adicional (ej. transporte) a otro proveedor.
    const extraSupplierId = getStringField(formData, "extraSupplierId").trim();
    const extraCost = Number(getStringField(formData, "extraCost").replace(/\D/g, "")) || 0;
    const extraConcept = getStringField(formData, "extraConcept").trim();
    if (extraSupplierId && extraCost > 0) {
      const extraSupplier = await prisma.supplier.findFirst({
        where: { id: extraSupplierId, isActive: true },
        select: { id: true },
      });
      if (extraSupplier) {
        await prisma.supplierLedgerEntry.create({
          data: {
            supplierId: extraSupplier.id,
            code: buildInventoryChargeCode((invSeq += 1)),
            type: "CHARGE",
            amount: extraCost,
            note: `${extraConcept || "Costo adicional"} - ${productName} (x${parsed.data.quantity})`,
            paymentDate: parsed.data.movementDate,
            inventoryMovementId: movementId,
            createdById,
          },
        });
        createdAnyCharge = true;
      }
    }

    if (createdAnyCharge) {
      revalidatePath("/admin/proveedores");
    }
  }

  await logActivity({
    action: "CREATE",
    entityType: "INVENTORY",
    entityId: movementId,
    summary: `Registró un movimiento de inventario (${parsed.data.type}) de "${productName}" x${parsed.data.quantity}`,
  });

  revalidatePath("/admin/inventario");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Movimiento registrado" }).toString()}`);
}

// Compra directa desde el modal de Ordenes: varios productos en una sola
// operacion, cada uno con su proveedor. Por cada linea genera una entrada de
// stock (IN) y, si tiene proveedor y costo, un cargo (deuda) a ese proveedor
// por su costo de compra (costo unitario x cantidad).
// Registra una compra directa. Si se pasa editOrderId, actualiza ESA misma orden
// (mismo numero, estado, pagos y despachos; ver runPurchaseEdit); si no, crea una nueva.
async function runDirectPurchase(formData: FormData, editOrderId?: string): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const rawDate = getStringField(formData, "movementDate").trim();
  const movementDate = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(movementDate.getTime())) {
    redirectWithError(returnTo, "Fecha invalida.");
  }

  // Lineas de la compra. Producto normal: { productId, quantity, cost, supplierId }.
  // Combo: { productId, quantity, components: [{ childId, supplierId, cost }] } —
  // cada componente con su proveedor y costo (costo por combo).
  type ComponentCharge = { childId: string; supplierId: string; cost: number };
  let items: Array<{
    orderItemId: string;
    productId: string;
    quantity: number;
    cost: number;
    supplierId: string;
    color: string;
    description: string;
    imageUrl: string;
    components: ComponentCharge[];
  }> = [];
  const rawItems = getStringField(formData, "items");
  try {
    const parsed = JSON.parse(rawItems) as unknown;
    if (Array.isArray(parsed)) {
      items = parsed
        .filter(
          (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
        )
        .map((entry) => ({
          orderItemId: typeof entry.orderItemId === "string" ? entry.orderItemId.trim() : "",
          productId: typeof entry.productId === "string" ? entry.productId.trim() : "",
          quantity: Math.trunc(Number(entry.quantity) || 0),
          cost: Number(entry.cost) || 0,
          supplierId: typeof entry.supplierId === "string" ? entry.supplierId.trim() : "",
          color: typeof entry.color === "string" ? entry.color.trim() : "",
          description: typeof entry.description === "string" ? entry.description.trim() : "",
          imageUrl: typeof entry.imageUrl === "string" ? entry.imageUrl.trim() : "",
          components: Array.isArray(entry.components)
            ? entry.components
                .filter(
                  (component): component is Record<string, unknown> =>
                    Boolean(component) && typeof component === "object",
                )
                .map((component) => ({
                  childId: typeof component.childId === "string" ? component.childId.trim() : "",
                  supplierId: typeof component.supplierId === "string" ? component.supplierId.trim() : "",
                  cost: Number(component.cost) || 0,
                }))
                .filter((component) => component.childId)
            : [],
        }))
        .filter((entry) => entry.productId && entry.quantity > 0);
    }
  } catch {
    // ignore: se valida abajo con items vacio.
  }

  if (items.length === 0) {
    redirectWithError(returnTo, "Agrega al menos un producto con cantidad.");
  }

  // Pre-valida cada producto antes de escribir nada (los movimientos no son
  // transaccionales entre si). Un combo es valido si tiene componentes; un
  // producto normal debe manejar inventario (tipo Stock).
  const productInfoById = new Map<
    string,
    {
      name: string;
      isBundle: boolean;
      components: Array<{ childId: string; quantity: number; name: string }>;
    }
  >();
  for (const item of items) {
    if (productInfoById.has(item.productId)) continue;
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: {
        name: true,
        isBundle: true,
        bundleComponents: {
          select: { childId: true, quantity: true, child: { select: { name: true } } },
        },
      },
    });
    if (!product) {
      redirectWithError(returnTo, "Uno de los productos no existe.");
    }
    if (product.isBundle) {
      const components = product.bundleComponents
        .filter((component) => component.quantity > 0)
        .map((component) => ({
          childId: component.childId,
          quantity: component.quantity,
          name: component.child.name,
        }));
      if (components.length === 0) {
        redirectWithError(returnTo, `El combo ${product.name} no tiene componentes configurados.`);
      }
      productInfoById.set(item.productId, { name: product.name, isBundle: true, components });
    } else {
      const trackable = await repository.isTrackableProduct(item.productId);
      if (!trackable) {
        redirectWithError(returnTo, `${product.name} no maneja inventario (debe ser tipo Stock).`);
      }
      productInfoById.set(item.productId, { name: product.name, isBundle: false, components: [] });
    }
  }

  // Costos adicionales de la compra (ej. envio): [{ concept, supplierId, amount }].
  let extraCosts: Array<{ concept: string; supplierId: string; amount: number }> = [];
  const rawExtraCosts = getStringField(formData, "extraCosts");
  try {
    const parsed = JSON.parse(rawExtraCosts) as unknown;
    if (Array.isArray(parsed)) {
      extraCosts = parsed
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          concept: typeof entry.concept === "string" ? entry.concept.trim() : "",
          supplierId: typeof entry.supplierId === "string" ? entry.supplierId.trim() : "",
          amount: Number(entry.amount) || 0,
        }))
        .filter((entry) => entry.supplierId && entry.amount > 0);
    }
  } catch {
    // ignore
  }

  // Cache de proveedores activos validados, para no consultar repetido.
  const activeSupplierById = new Map<string, { id: string; name: string } | null>();
  const resolveSupplier = async (supplierId: string): Promise<{ id: string; name: string } | null> => {
    if (!supplierId) return null;
    if (activeSupplierById.has(supplierId)) return activeSupplierById.get(supplierId)!;
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, isActive: true },
      select: { id: true, name: true },
    });
    activeSupplierById.set(supplierId, supplier);
    return supplier;
  };

  if (editOrderId) {
    await runPurchaseEdit({ orderId: editOrderId, items, productInfoById, movementDate, rawDate, resolveSupplier, createdById, returnTo });
    return;
  }
  const purchaseCode = await getNextPurchaseCode();

  let invSeq = await getNextInventoryChargeSeq();
  const movementIds: string[] = [];
  // Primer movimiento creado: a el se ligan los costos adicionales (envio, etc.)
  // para que se borren en cascada si se elimina la compra.
  let firstMovementId: string | null = null;

  // Subtotal (productos) y total (con costos adicionales) para la orden de compra.
  let subtotal = 0;
  const supplierIdSet = new Set<string>();
  for (const item of items) {
    const product = productInfoById.get(item.productId)!;
    if (product.isBundle) {
      const chargeByChild = new Map(item.components.map((component) => [component.childId, component]));
      for (const component of product.components) {
        const charge = chargeByChild.get(component.childId);
        subtotal += (charge?.cost ?? 0) * item.quantity;
        if (charge?.supplierId) supplierIdSet.add(charge.supplierId);
      }
    } else {
      subtotal += item.cost * item.quantity;
      if (item.supplierId) supplierIdSet.add(item.supplierId);
    }
  }
  const extrasTotal = extraCosts.reduce((sum, extra) => sum + extra.amount, 0);
  for (const extra of extraCosts) if (extra.supplierId) supplierIdSet.add(extra.supplierId);
  const total = subtotal + extrasTotal;

  // Proveedor de la orden: solo si toda la compra es a un unico proveedor activo.
  let orderSupplierId: string | null = null;
  if (supplierIdSet.size === 1) {
    const candidate = await resolveSupplier(Array.from(supplierIdSet)[0]);
    orderSupplierId = candidate?.id ?? null;
  }

  let purchaseOrderId: string;
  try {
    // Orden de compra (type PURCHASE): sin venta/cotizacion/cliente.
    const order = await prisma.order.create({
      data: {
        code: await getNextOrderCode(),
        type: "PURCHASE",
        status: "RELEASED",
        releasedAt: movementDate,
        supplierId: orderSupplierId,
        purchaseCode,
        createdById,
        subtotal,
        total,
        history: {
          create: { toStatus: "RELEASED", note: "Compra registrada", changedById: createdById },
        },
      },
      select: { id: true },
    });
    purchaseOrderId = order.id;

    for (const item of items) {
      const product = productInfoById.get(item.productId)!;

      if (product.isBundle) {
        // Combo: no hay stock propio. Por cada componente se reparte el stock
        // (unidades del componente x cantidad de combos) y se carga su costo al
        // proveedor elegido para ese componente.
        const chargeByChild = new Map(item.components.map((component) => [component.childId, component]));
        for (const component of product.components) {
          const movementId = await registerInventoryMovementUseCase(repository, {
            productId: component.childId,
            type: "IN",
            quantity: component.quantity * item.quantity,
            note: `Compra combo ${product.name} (x${item.quantity})`,
            movementDate,
            createdById,
          });
          movementIds.push(movementId);
          if (firstMovementId === null) firstMovementId = movementId;

          const charge = chargeByChild.get(component.childId);
          const supplier = charge ? await resolveSupplier(charge.supplierId) : null;
          const units = component.quantity * item.quantity;
          const lineTotal = (charge?.cost ?? 0) * item.quantity;
          const unitPrice = units > 0 ? Math.round(lineTotal / units) : 0;
          const orderItem = await prisma.orderItem.create({
            data: {
              orderId: purchaseOrderId,
              productId: component.childId,
              quantity: units,
              unitPrice,
              lineTotal,
              fulfillmentMode: "STOCK",
              confirmedSupplierId: supplier?.id ?? null,
              purchaseCost: unitPrice,
              confirmedAt: movementDate,
              supplierPaymentStatus: supplier ? "PENDING" : null,
              notes: `Combo ${product.name}`,
            },
            select: { id: true },
          });

          if (supplier && charge && charge.cost > 0) {
            await prisma.supplierLedgerEntry.create({
              data: {
                supplierId: supplier.id,
                code: buildInventoryChargeCode((invSeq += 1)),
                type: "CHARGE",
                // Costo del componente por combo x cantidad de combos comprados.
                amount: charge.cost * item.quantity,
                note: `Compra inventario - ${component.name} (Combo ${product.name} x${item.quantity})`,
                paymentDate: movementDate,
                inventoryMovementId: movementId,
                orderId: purchaseOrderId,
                orderItemId: orderItem.id,
                createdById,
              },
            });
          }
        }
        continue;
      }

      // Producto normal: una entrada y, si tiene proveedor y costo, un cargo.
      const supplier = await resolveSupplier(item.supplierId);
      const movementId = await registerInventoryMovementUseCase(repository, {
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        note: supplier ? `Compra a ${supplier.name}` : "Compra directa",
        movementDate,
        createdById,
      });
      movementIds.push(movementId);
      if (firstMovementId === null) firstMovementId = movementId;

      // Nota del item: combina color y descripcion (si los hay).
      const itemNotes =
        [item.color ? `Color: ${item.color}` : "", item.description].filter(Boolean).join(" · ") || null;
      const orderItem = await prisma.orderItem.create({
        data: {
          orderId: purchaseOrderId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.cost,
          lineTotal: item.cost * item.quantity,
          fulfillmentMode: "STOCK",
          confirmedSupplierId: supplier?.id ?? null,
          purchaseCost: item.cost,
          confirmedAt: movementDate,
          supplierPaymentStatus: supplier ? "PENDING" : null,
          notes: itemNotes,
        },
        select: { id: true },
      });
      // Foto opcional del item (sirve tambien para el despacho, que pide fotos).
      if (item.imageUrl) {
        await prisma.orderItemPhoto.create({
          data: { orderItemId: orderItem.id, url: item.imageUrl },
        });
      }

      if (supplier && item.cost > 0) {
        await prisma.supplierLedgerEntry.create({
          data: {
            supplierId: supplier.id,
            code: buildInventoryChargeCode((invSeq += 1)),
            type: "CHARGE",
            // Total con el proveedor = costo unitario x cantidad. La nota empieza
            // por "Compra inventario" para que el reajuste por cantidad la tome.
            amount: item.cost * item.quantity,
            note: `Compra inventario - ${product.name} (x${item.quantity})`,
            paymentDate: movementDate,
            inventoryMovementId: movementId,
            orderId: purchaseOrderId,
            orderItemId: orderItem.id,
            createdById,
          },
        });
      }
    }

    // Costos adicionales (ej. envio): un cargo fijo a cada proveedor. La nota NO
    // empieza por "Compra inventario" para que no entre al reajuste por cantidad.
    for (const extra of extraCosts) {
      const supplier = await resolveSupplier(extra.supplierId);
      if (!supplier) continue;
      await prisma.supplierLedgerEntry.create({
        data: {
          supplierId: supplier.id,
          code: buildInventoryChargeCode((invSeq += 1)),
          type: "CHARGE",
          amount: extra.amount,
          note: extra.concept || "Costo adicional",
          paymentDate: movementDate,
          inventoryMovementId: firstMovementId,
          orderId: purchaseOrderId,
          createdById,
        },
      });
    }

    // Agrupa todos los movimientos de esta compra bajo el mismo codigo (COM-...).
    if (movementIds.length > 0) {
      await prisma.inventoryMovement.updateMany({
        where: { id: { in: movementIds } },
        data: { purchaseCode },
      });
    }
  } catch (error) {
    if (error instanceof InventoryError) {
      redirectWithError(returnTo, error.message);
    }
    throw error;
  }

  await logActivity({
    action: "CREATE",
    entityType: "PURCHASE",
    entityId: purchaseOrderId,
    summary: `Registró la compra ${purchaseCode} (${items.length} producto${items.length === 1 ? "" : "s"})`,
  });

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/ordenes");
  redirect(
    `/admin/ordenes/${purchaseOrderId}?${new URLSearchParams({ ok: "Compra registrada" }).toString()}`,
  );
}

// Error de negocio dentro de la transaccion de edicion (se muestra al usuario).
class PurchaseEditError extends Error {}

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type PurchaseEditInput = {
  orderId: string;
  items: Array<{
    orderItemId: string;
    productId: string;
    quantity: number;
    cost: number;
    supplierId: string;
    color: string;
    description: string;
    imageUrl: string;
    components: Array<{ childId: string; supplierId: string; cost: number }>;
  }>;
  productInfoById: Map<
    string,
    { name: string; isBundle: boolean; components: Array<{ childId: string; quantity: number; name: string }> }
  >;
  movementDate: Date;
  rawDate: string;
  resolveSupplier: (supplierId: string) => Promise<{ id: string; name: string } | null>;
  createdById: string;
  returnTo: string;
};

// Edita una compra SOBRE LA MISMA ORDEN: conserva su numero ORD, el COM, el estado,
// el historial, los despachos y los pagos a proveedoras. Las lineas existentes se
// actualizan, las nuevas se crean y las quitadas se borran (no si tienen despacho o
// pagos). El stock solo cambia por la diferencia de unidades; sin cambios, no se mueve.
async function runPurchaseEdit(input: PurchaseEditInput): Promise<void> {
  const { orderId, items, productInfoById, movementDate, rawDate, resolveSupplier, createdById, returnTo } = input;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      type: true,
      status: true,
      purchaseCode: true,
      subtotal: true,
      total: true,
      releasedAt: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          purchaseCost: true,
          lineTotal: true,
          notes: true,
          confirmedSupplierId: true,
          supplierPaymentStatus: true,
          product: { select: { name: true } },
          photos: { select: { url: true } },
          _count: { select: { dispatchItems: true } },
        },
      },
    },
  });
  if (!order || order.type !== "PURCHASE") {
    redirectWithError(returnTo, "La compra a editar no existe.");
  }
  if (order.status === "CANCELLED") {
    redirectWithError(returnTo, "Esta compra está anulada: no se puede editar.");
  }
  if (!order.purchaseCode) {
    redirectWithError(returnTo, "Esta compra no tiene código COM: no se puede editar aquí.");
  }
  const purchaseCode = order.purchaseCode;

  const itemIds = order.items.map((item) => item.id);
  const charges = await prisma.supplierLedgerEntry.findMany({
    where: { type: "CHARGE", orderItemId: { in: itemIds } },
    select: { id: true, orderItemId: true, supplierId: true, amount: true },
  });
  const payments = await prisma.supplierLedgerEntry.findMany({
    where: {
      type: "PAYMENT",
      OR: [{ orderItemId: { in: itemIds } }, { settlesEntryId: { in: charges.map((charge) => charge.id) } }],
    },
    select: { orderItemId: true, settlesEntryId: true },
  });
  const itemIdByCharge = new Map(charges.map((charge) => [charge.id, charge.orderItemId]));
  const paidItemIds = new Set(
    payments.map((payment) => payment.orderItemId ?? itemIdByCharge.get(payment.settlesEntryId ?? "") ?? null),
  );

  const existing: ExistingPurchaseItem[] = order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.product.name,
    quantity: item.quantity,
    cost: Number(item.purchaseCost ?? item.unitPrice),
    supplierId: item.confirmedSupplierId,
    dispatched: item._count.dispatchItems > 0,
    hasPayments: paidItemIds.has(item.id),
  }));
  // Los combos nuevos siempre se crean; las lineas sueltas se cruzan con las existentes.
  const bundleLines = items.filter((item) => productInfoById.get(item.productId)!.isBundle);
  const plan = planPurchaseEdit(
    existing,
    items.filter((item) => !productInfoById.get(item.productId)!.isBundle),
  );
  if (plan.error) {
    redirectWithError(returnTo, plan.error);
  }

  // Resuelve proveedores antes de la transaccion.
  const supplierByLine = new Map<string, { id: string; name: string } | null>();
  for (const item of items) {
    supplierByLine.set(item.supplierId, await resolveSupplier(item.supplierId));
    for (const component of item.components) {
      supplierByLine.set(component.supplierId, await resolveSupplier(component.supplierId));
    }
  }
  const supplierOf = (supplierId: string) => supplierByLine.get(supplierId) ?? null;
  const notesOf = (item: { color: string; description: string }) =>
    [item.color ? `Color: ${item.color}` : "", item.description].filter(Boolean).join(" · ") || null;
  const dateChanged = rawDate !== "" && rawDate !== toDateInput(order.releasedAt ?? order.createdAt);
  // Sin cambio de fecha se conserva la de la compra (no se corre de dia).
  const effectiveDate = dateChanged ? movementDate : (order.releasedAt ?? order.createdAt);
  let invSeq = await getNextInventoryChargeSeq();

  try {
    await prisma.$transaction(async (tx) => {
      // Nunca se borra un cargo que ya tiene abonos: el abono se iria en cascada.
      const deleteCharges = async (ids: string[]) => {
        if (ids.length === 0) return;
        const settled = await tx.supplierLedgerEntry.count({ where: { type: "PAYMENT", settlesEntryId: { in: ids } } });
        if (settled > 0) throw new PurchaseEditError("Un cargo de esta compra tiene pagos: no se puede cambiar.");
        await tx.supplierLedgerEntry.deleteMany({ where: { id: { in: ids } } });
      };
      const createCharge = (data: { supplierId: string; amount: number; note: string; orderItemId: string }) =>
        tx.supplierLedgerEntry.create({
          data: {
            ...data,
            code: buildInventoryChargeCode((invSeq += 1)),
            type: "CHARGE",
            paymentDate: effectiveDate,
            orderId,
            createdById,
          },
        });

      // 1) Lineas quitadas: sus cargos y la linea (el plan ya bloqueo despachos y pagos).
      const removedIds = plan.remove.map((item) => item.id);
      await deleteCharges(charges.filter((charge) => removedIds.includes(charge.orderItemId ?? "")).map((c) => c.id));
      if (removedIds.length > 0) {
        await tx.orderItem.deleteMany({ where: { id: { in: removedIds } } });
      }

      // 2) Lineas existentes: se actualizan en su lugar (sin cambios, solo notas y foto).
      for (const { item, line, changed } of plan.keep) {
        const stored = order.items.find((orderItem) => orderItem.id === item.id)!;
        const notes = notesOf(line);
        if (changed) {
          const supplier = supplierOf(line.supplierId);
          const lineTotal = line.cost * line.quantity;
          const itemCharges = charges.filter((charge) => charge.orderItemId === item.id);
          const sameSupplier = supplier ? itemCharges.find((charge) => charge.supplierId === supplier.id) : undefined;
          await deleteCharges(itemCharges.filter((charge) => charge !== sameSupplier).map((charge) => charge.id));
          if (supplier && line.cost > 0) {
            if (sameSupplier) {
              await tx.supplierLedgerEntry.update({ where: { id: sameSupplier.id }, data: { amount: lineTotal } });
            } else {
              await createCharge({
                supplierId: supplier.id,
                amount: lineTotal,
                note: `Compra inventario - ${item.name} (x${line.quantity})`,
                orderItemId: item.id,
              });
            }
          } else if (sameSupplier) {
            await deleteCharges([sameSupplier.id]);
          }
          await tx.orderItem.update({
            where: { id: item.id },
            data: {
              quantity: line.quantity,
              unitPrice: line.cost,
              lineTotal,
              purchaseCost: line.cost,
              confirmedSupplierId: supplier?.id ?? null,
              supplierPaymentStatus: supplier ? (stored.supplierPaymentStatus ?? "PENDING") : null,
              notes,
            },
          });
        } else if (notes !== stored.notes) {
          await tx.orderItem.update({ where: { id: item.id }, data: { notes } });
        }
        if (line.imageUrl && !stored.photos.some((photo) => photo.url === line.imageUrl)) {
          await tx.orderItemPhoto.create({ data: { orderItemId: item.id, url: line.imageUrl } });
        }
      }

      // 3) Lineas nuevas (productos sueltos y combos repartidos en sus componentes).
      const newRows: Array<{
        productId: string;
        name: string;
        units: number;
        lineTotal: number;
        supplierId: string;
        notes: string | null;
        imageUrl: string;
        chargeNote: string;
      }> = [];
      for (const line of plan.create) {
        const name = productInfoById.get(line.productId)!.name;
        newRows.push({
          productId: line.productId,
          name,
          units: line.quantity,
          lineTotal: line.cost * line.quantity,
          supplierId: line.supplierId,
          notes: notesOf(line),
          imageUrl: line.imageUrl,
          chargeNote: `Compra inventario - ${name} (x${line.quantity})`,
        });
      }
      for (const line of bundleLines) {
        const product = productInfoById.get(line.productId)!;
        const chargeByChild = new Map(line.components.map((component) => [component.childId, component]));
        for (const component of product.components) {
          const charge = chargeByChild.get(component.childId);
          newRows.push({
            productId: component.childId,
            name: component.name,
            units: component.quantity * line.quantity,
            lineTotal: (charge?.cost ?? 0) * line.quantity,
            supplierId: charge?.supplierId ?? "",
            notes: `Combo ${product.name}`,
            imageUrl: "",
            chargeNote: `Compra inventario - ${component.name} (Combo ${product.name} x${line.quantity})`,
          });
        }
      }
      for (const row of newRows) {
        const supplier = supplierOf(row.supplierId);
        const unitPrice = row.units > 0 ? Math.round(row.lineTotal / row.units) : 0;
        const created = await tx.orderItem.create({
          data: {
            orderId,
            productId: row.productId,
            quantity: row.units,
            unitPrice,
            lineTotal: row.lineTotal,
            fulfillmentMode: "STOCK",
            confirmedSupplierId: supplier?.id ?? null,
            purchaseCost: unitPrice,
            confirmedAt: effectiveDate,
            supplierPaymentStatus: supplier ? "PENDING" : null,
            notes: row.notes,
          },
          select: { id: true },
        });
        if (row.imageUrl) {
          await tx.orderItemPhoto.create({ data: { orderItemId: created.id, url: row.imageUrl } });
        }
        if (supplier && row.lineTotal > 0) {
          await createCharge({ supplierId: supplier.id, amount: row.lineTotal, note: row.chargeNote, orderItemId: created.id });
        }
      }

      // 4) Stock: solo la diferencia de unidades por producto contra las entradas de la compra.
      const finalItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { id: true, productId: true, quantity: true, lineTotal: true, confirmedSupplierId: true },
      });
      const movements = await tx.inventoryMovement.findMany({
        where: { purchaseCode },
        select: { id: true, productId: true, change: true },
      });
      const currentUnits = new Map<string, number>();
      for (const movement of movements) {
        currentUnits.set(movement.productId, (currentUnits.get(movement.productId) ?? 0) + movement.change);
      }
      const newUnits = new Map<string, number>();
      for (const item of finalItems) {
        newUnits.set(item.productId, (newUnits.get(item.productId) ?? 0) + item.quantity);
      }
      for (const [productId, delta] of purchaseStockDeltas(currentUnits, newUnits)) {
        if (delta < 0) {
          const stock = await tx.inventoryMovement.aggregate({ where: { productId }, _sum: { change: true } });
          if ((stock._sum.change ?? 0) + delta < 0) {
            const name = order.items.find((item) => item.productId === productId)?.product.name ?? "un producto";
            throw new PurchaseEditError(`No se puede bajar ${name}: esas unidades ya salieron del inventario.`);
          }
        }
        // Rehace la entrada del producto con el total nuevo. Antes se desligan los
        // cargos (el borrado del movimiento los borraria en cascada, y con ellos sus abonos).
        const oldIds = movements.filter((movement) => movement.productId === productId).map((movement) => movement.id);
        await tx.supplierLedgerEntry.updateMany({ where: { inventoryMovementId: { in: oldIds } }, data: { inventoryMovementId: null } });
        await tx.inventoryMovement.deleteMany({ where: { id: { in: oldIds } } });
        const units = newUnits.get(productId) ?? 0;
        if (units > 0) {
          const movement = await tx.inventoryMovement.create({
            data: {
              productId,
              type: "IN",
              change: units,
              note: `Compra ${purchaseCode} (editada)`,
              purchaseCode,
              movementDate: effectiveDate,
              createdById,
            },
            select: { id: true },
          });
          await tx.supplierLedgerEntry.updateMany({
            where: { type: "CHARGE", orderItemId: { in: finalItems.filter((item) => item.productId === productId).map((item) => item.id) } },
            data: { inventoryMovementId: movement.id },
          });
        }
      }

      // 5) Fecha: solo si se cambio en el formulario.
      if (dateChanged) {
        await tx.inventoryMovement.updateMany({ where: { purchaseCode }, data: { movementDate } });
        await tx.supplierLedgerEntry.updateMany({ where: { orderId, type: "CHARGE" }, data: { paymentDate: movementDate } });
      }

      // 6) Totales (conservan envio y costos adicionales) y proveedor de la orden.
      const newSubtotal = finalItems.reduce((sum, item) => sum + Number(item.lineTotal), 0);
      const totals = purchaseEditTotals({ subtotal: Number(order.subtotal), total: Number(order.total) }, newSubtotal);
      const extraCharges = await tx.supplierLedgerEntry.findMany({
        where: { orderId, type: "CHARGE", orderItemId: null },
        select: { supplierId: true },
      });
      const supplierIds = new Set<string>([
        ...finalItems.map((item) => item.confirmedSupplierId).filter((id): id is string => Boolean(id)),
        ...extraCharges.map((charge) => charge.supplierId),
      ]);
      await tx.order.update({
        where: { id: orderId },
        data: {
          ...totals,
          supplierId: supplierIds.size === 1 ? Array.from(supplierIds)[0] : null,
          ...(dateChanged ? { releasedAt: movementDate } : {}),
        },
      });

      // 7) Pagado/pendiente por proveedora, con la misma regla de los abonos.
      for (const supplierId of new Set(finalItems.map((item) => item.confirmedSupplierId).filter(Boolean) as string[])) {
        const [chargeAgg, payAgg] = await Promise.all([
          tx.supplierLedgerEntry.aggregate({ _sum: { amount: true }, where: { orderId, supplierId, type: "CHARGE" } }),
          tx.supplierLedgerEntry.aggregate({ _sum: { amount: true }, where: { orderId, supplierId, type: "PAYMENT" } }),
        ]);
        const charged = Number(chargeAgg._sum.amount ?? 0);
        if (charged <= 0) continue;
        const pending = charged - Number(payAgg._sum.amount ?? 0);
        if (pending <= 0.0001) {
          await tx.orderItem.updateMany({ where: { orderId, confirmedSupplierId: supplierId }, data: { supplierPaymentStatus: "PAID" } });
        } else {
          const itemLevelPaid = await tx.supplierLedgerEntry.findMany({
            where: { type: "PAYMENT", orderItemId: { in: finalItems.map((item) => item.id) } },
            select: { orderItemId: true },
          });
          await tx.orderItem.updateMany({
            where: {
              orderId,
              confirmedSupplierId: supplierId,
              supplierPaymentStatus: "PAID",
              id: { notIn: itemLevelPaid.map((entry) => entry.orderItemId!).filter(Boolean) },
            },
            data: { supplierPaymentStatus: "PENDING" },
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof PurchaseEditError) {
      redirectWithError(returnTo, error.message);
    }
    throw error;
  }

  await logActivity({
    action: "UPDATE",
    entityType: "PURCHASE",
    entityId: orderId,
    summary: `Editó la compra ${purchaseCode} (${items.length} producto${items.length === 1 ? "" : "s"})`,
  });

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/ordenes");
  redirect(`/admin/ordenes/${orderId}?${new URLSearchParams({ ok: "Compra actualizada" }).toString()}`);
}

export async function adminCreateDirectPurchaseAction(formData: FormData): Promise<void> {
  await runDirectPurchase(formData);
}

// Edita una compra: reabre el formulario y, al guardar, actualiza la misma orden.
export async function adminUpdateDirectPurchaseAction(formData: FormData): Promise<void> {
  const orderId = getStringField(formData, "orderId").trim();
  if (!orderId) {
    redirectWithError(getReturnTo(formData, "/admin/ordenes"), "Compra invalida.");
  }
  await runDirectPurchase(formData, orderId);
}

// Elimina una orden de compra: revierte el stock (borra sus movimientos de
// inventario) y elimina los cobros a proveedores ligados a ella.
export async function adminDeletePurchaseOrderAction(
  orderId: string,
  keepInventoryMovements = false,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdminSession();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, type: true, purchaseCode: true },
  });
  if (!order || order.type !== "PURCHASE") {
    return { ok: false, error: "Solo se pueden eliminar ordenes de compra." };
  }

  // Una compra con pagos no se borra (los abonos se irian con ella): solo se anula.
  const paymentCount = await prisma.supplierLedgerEntry.count({
    where: {
      type: "PAYMENT",
      OR: [
        { orderId },
        { orderItem: { orderId } },
        { settlesEntry: { orderId } },
        ...(order.purchaseCode ? [{ settlesEntry: { inventoryMovement: { purchaseCode: order.purchaseCode } } }] : []),
      ],
    },
  });
  if (paymentCount > 0) {
    return { ok: false, error: "Esta compra tiene pagos: anúlala con un motivo." };
  }

  await prisma.$transaction(async (tx) => {
    // 1) Borra los movimientos de inventario de la compra → el stock se revierte
    //    (deja de sumar) y sus cargos a proveedores se borran en cascada.
    //    Si keepInventoryMovements es true, se conservan: el stock ingresado y
    //    sus cargos a proveedores permanecen aunque se borre la orden. Se
    //    desliga purchaseCode/orderId para que no queden referencias rotas.
    if (order.purchaseCode) {
      if (keepInventoryMovements) {
        await tx.inventoryMovement.updateMany({
          where: { purchaseCode: order.purchaseCode },
          data: { purchaseCode: null },
        });
      } else {
        await tx.inventoryMovement.deleteMany({ where: { purchaseCode: order.purchaseCode } });
      }
    }
    // 2) Limpia cualquier cargo restante ligado a la orden (ej. envio/transportadora).
    //    Si se conservan los movimientos, se mantienen sus cargos de compra a
    //    proveedores (los ligados a un inventoryMovement); su orderId queda en
    //    null al borrar la orden (FK SetNull).
    await tx.supplierLedgerEntry.deleteMany({
      where: keepInventoryMovements ? { orderId, inventoryMovementId: null } : { orderId },
    });
    // 3) Borra despachos (sus DispatchItem se van en cascada). Necesario antes de
    //    borrar la orden: DispatchItem -> OrderItem es Restrict y bloquearia.
    await tx.dispatch.deleteMany({ where: { orderId } });
    // 4) Borra la orden (en cascada: items, fotos, produccion e historial).
    await tx.order.delete({ where: { id: orderId } });
  });

  await logActivity({
    action: "DELETE",
    entityType: "PURCHASE",
    entityId: orderId,
    summary: order.purchaseCode
      ? `Eliminó la compra ${order.purchaseCode}`
      : `Eliminó la compra ${orderId}`,
  });

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/ordenes");
  return { ok: true };
}

export async function adminDeleteInventoryMovementAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const id = getStringField(formData, "movementId").trim();
  if (!id) {
    redirectWithError(returnTo, "Movimiento invalido");
  }

  const movementToDelete = await prisma.inventoryMovement.findUnique({
    where: { id },
    select: { product: { select: { name: true } } },
  });

  try {
    // Los cargos al proveedor ligados a este movimiento se borran en cascada (FK).
    await prisma.inventoryMovement.delete({ where: { id } });
  } catch {
    redirectWithError(returnTo, "No se pudo eliminar el movimiento");
  }

  await logActivity({
    action: "DELETE",
    entityType: "INVENTORY",
    entityId: id,
    summary: movementToDelete?.product
      ? `Eliminó un movimiento de inventario de "${movementToDelete.product.name}"`
      : `Eliminó el movimiento de inventario ${id}`,
  });

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Movimiento eliminado" }).toString()}`);
}

export async function adminUpdateInventoryMovementAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const id = getStringField(formData, "movementId").trim();
  if (!id) {
    redirectWithError(returnTo, "Movimiento invalido");
  }

  const movement = await prisma.inventoryMovement.findUnique({
    where: { id },
    select: { id: true, productId: true, change: true, product: { select: { name: true } } },
  });
  if (!movement) {
    redirectWithError(returnTo, "Movimiento no encontrado");
  }

  const type = getStringField(formData, "type") as "IN" | "OUT" | "ADJUSTMENT";
  const quantity = Math.trunc(Number(getStringField(formData, "quantity")) || 0);
  const note = getStringField(formData, "note").trim() || null;
  const rawDate = getStringField(formData, "movementDate");
  const movementDate = rawDate ? new Date(rawDate) : new Date();

  // Stock del producto sin contar este movimiento.
  const agg = await prisma.inventoryMovement.aggregate({
    where: { productId: movement.productId },
    _sum: { change: true },
  });
  const stockExcluding = (agg._sum.change ?? 0) - movement.change;

  let change: number;
  if (type === "IN") {
    if (quantity <= 0) redirectWithError(returnTo, "La cantidad de entrada debe ser mayor a cero.");
    change = quantity;
  } else if (type === "OUT") {
    if (quantity <= 0) redirectWithError(returnTo, "La cantidad de salida debe ser mayor a cero.");
    if (quantity > stockExcluding) redirectWithError(returnTo, `No hay stock suficiente. Disponible: ${stockExcluding}.`);
    change = -quantity;
  } else {
    change = quantity - stockExcluding;
    if (change === 0) redirectWithError(returnTo, "El conteo coincide con el stock actual; no hay ajuste que registrar.");
  }

  await prisma.inventoryMovement.update({
    where: { id },
    data: { type, change, note, movementDate },
  });

  // Los cargos de compra ligados a este movimiento se guardan como total
  // (costo unitario x cantidad). Al cambiar la cantidad, se reajustan de forma
  // proporcional para que el saldo con el proveedor siga la nueva cantidad.
  // El costo adicional (transporte) es un monto fijo y su nota no empieza por
  // "Compra inventario", por lo que queda excluido del reajuste.
  const oldQty = Math.abs(movement.change);
  const newQty = Math.abs(change);
  if (oldQty > 0 && newQty > 0 && newQty !== oldQty) {
    const linkedCharges = await prisma.supplierLedgerEntry.findMany({
      where: { inventoryMovementId: id, type: "CHARGE" },
      select: { id: true, amount: true, note: true },
    });
    for (const charge of linkedCharges) {
      if (!charge.note?.startsWith("Compra inventario")) continue;
      const rescaled = Math.round((Number(charge.amount) * newQty) / oldQty);
      await prisma.supplierLedgerEntry.update({
        where: { id: charge.id },
        data: { amount: rescaled },
      });
    }
  }

  await logActivity({
    action: "UPDATE",
    entityType: "INVENTORY",
    entityId: id,
    summary: movement.product
      ? `Actualizó un movimiento de inventario (${type}) de "${movement.product.name}"`
      : `Actualizó el movimiento de inventario ${id}`,
  });

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/proveedores");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Movimiento actualizado" }).toString()}`);
}

export async function adminUpdateMinStockAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);

  const parsed = minStockUpdateSchema.safeParse({
    productId: getStringField(formData, "productId"),
    minStock: getStringField(formData, "minStock"),
  });

  if (!parsed.success) {
    redirectWithError(returnTo, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }

  const trackable = await repository.isTrackableProduct(parsed.data.productId);
  if (!trackable) {
    redirectWithError(returnTo, "El producto no maneja inventario.");
  }

  await updateMinStockUseCase(repository, parsed.data.productId, parsed.data.minStock);

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/productos");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Stock minimo actualizado" }).toString()}`);
}
