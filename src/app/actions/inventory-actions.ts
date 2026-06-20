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

  let movementId: string;
  try {
    movementId = await registerInventoryMovementUseCase(repository, {
      productId: parsed.data.productId,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      note: parsed.data.note ?? null,
      movementDate: parsed.data.movementDate,
      createdById,
    });
  } catch (error) {
    if (error instanceof InventoryError) {
      redirectWithError(returnTo, error.message);
    }
    throw error;
  }

  // Si la compra (entrada/ajuste) se atribuye a un proveedor, genera un cargo
  // (deuda) en su cuenta corriente por el costo de compra.
  if (parsed.data.type === "IN" || parsed.data.type === "ADJUSTMENT") {
    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: { name: true },
    });
    const productName = product?.name ?? "producto";
    let createdAnyCharge = false;
    // Código secuencial INV-0000X; se incrementa por cada cargo de inventario creado.
    let invSeq = await getNextInventoryChargeSeq();

    // Cargo por la compra del producto.
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
            amount: purchaseCost,
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

  revalidatePath("/admin/inventario");
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
