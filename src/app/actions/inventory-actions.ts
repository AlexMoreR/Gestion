"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
import { buildInventoryChargeCode, parseInventoryChargeCodeNumber } from "@/lib/orders";
import { getProductPurchaseHistory, type ProductPurchaseRow } from "@/lib/product-purchase-history";

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

function redirectWithError(returnTo: string, message: string): never {
  const query = new URLSearchParams({ error: message }).toString();
  redirect(`${returnTo}?${query}`);
}

async function requireAdminSession(): Promise<string> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
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

  revalidatePath("/admin/inventario");
  redirect(`${returnTo}?${new URLSearchParams({ ok: "Movimiento registrado" }).toString()}`);
}

export async function adminDeleteInventoryMovementAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData);
  const id = getStringField(formData, "movementId").trim();
  if (!id) {
    redirectWithError(returnTo, "Movimiento invalido");
  }

  try {
    // Los cargos al proveedor ligados a este movimiento se borran en cascada (FK).
    await prisma.inventoryMovement.delete({ where: { id } });
  } catch {
    redirectWithError(returnTo, "No se pudo eliminar el movimiento");
  }

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
    select: { id: true, productId: true, change: true },
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
