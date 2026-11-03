"use server";

// Compra por lote: un botón por acción sobre una unidad (CompraUnidad). La deuda con la proveedora
// y el costo de la línea ya se cargaron completos al registrar la compra: acá nunca se crea
// SupplierLedgerEntry ni se toca OrderItem.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActivityActor, logActivityTx } from "@/lib/activity-log";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { displayCode } from "@/lib/code-display";
import { prisma } from "@/lib/prisma";
import {
  LOT_LOCATION_LABELS,
  lotArrivalEntries,
  validateLotTransition,
  type LotAction,
  type LotLocation,
} from "@/modules/inventory/domain/purchase-lot";

const LOTES_PATH = "/admin/inventario/lotes";

// Error de negocio: se muestra a la persona en el aviso.
class LotError extends Error {}

function back(kind: "ok" | "error", message: string): never {
  redirect(`${LOTES_PATH}?${new URLSearchParams({ [kind]: message }).toString()}`);
}

async function requireAdminUserId(): Promise<string> {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.role !== "ADMIN" ||
    !(await hasAdminModuleAccess(session.user.id, session.user.role, "inventory"))
  ) {
    redirect("/unauthorized");
  }
  return session.user.id;
}

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

type LockedUnit = {
  id: string;
  orderId: string;
  productId: string;
  estado: string;
  ubicacion: string | null;
  color: string | null;
};

async function runLotAction(formData: FormData, accion: LotAction): Promise<void> {
  const userId = await requireAdminUserId();
  const actor = await getActivityActor();
  const unitId = field(formData, "unitId");
  const datos = {
    color: field(formData, "color").slice(0, 60) || null,
    ubicacion: field(formData, "ubicacion") || null,
    saleOrderId: field(formData, "saleOrderId") || null,
  };
  if (!unitId) back("error", "Falta la unidad");

  let okMessage = "";
  try {
    await prisma.$transaction(async (tx) => {
      // Candado: dos clics (o dos personas) no aplican la misma acción dos veces.
      const [unidad] = await tx.$queryRaw<LockedUnit[]>`
        SELECT "id", "orderId", "productId", "estado", "ubicacion", "color"
        FROM "CompraUnidad" WHERE "id" = ${unitId} FOR UPDATE`;
      if (!unidad) throw new LotError("La unidad no existe");

      const motivo = validateLotTransition(unidad, accion, datos);
      if (motivo) throw new LotError(motivo);

      const compra = await tx.order.findUnique({
        where: { id: unidad.orderId },
        select: { code: true, purchaseCode: true },
      });
      const product = await tx.product.findUnique({
        where: { id: unidad.productId },
        select: {
          name: true,
          isBundle: true,
          bundleComponents: { select: { childId: true, quantity: true } },
        },
      });
      const codigo = compra?.purchaseCode ?? compra?.code ?? null;
      const nombre = product?.name ?? "Producto";
      const lugar = (u: string | null | undefined) => LOT_LOCATION_LABELS[u as LotLocation] ?? "sin ubicación";
      let summary = "";

      if (accion === "fabricar") {
        await tx.compraUnidad.update({ where: { id: unidad.id }, data: { estado: "FABRICANDO", color: datos.color } });
        summary = `Pasó a fabricar una unidad de ${nombre} (${datos.color})`;
        okMessage = "Unidad en fabricación";
      } else if (accion === "llego") {
        await tx.compraUnidad.update({
          where: { id: unidad.id },
          data: { estado: "EN_INVENTARIO", ubicacion: datos.ubicacion },
        });
        // Solo entra al inventario; la deuda y el costo ya están cargados desde la compra.
        const entradas = lotArrivalEntries(unidad.productId, product?.isBundle ? product.bundleComponents : null);
        if (entradas.length === 0) throw new LotError("El combo no tiene piezas para sumar al inventario");
        const note = `Compra ${displayCode(codigo) ?? ""} (llegó unidad del lote)`;
        for (const entrada of entradas) {
          await tx.inventoryMovement.create({
            data: {
              productId: entrada.productId,
              type: "IN",
              change: entrada.change,
              note,
              movementDate: new Date(),
              createdById: userId,
              purchaseCode: compra?.purchaseCode ?? null,
            },
          });
        }
        summary = `Llegó una unidad de ${nombre} a ${lugar(datos.ubicacion)}: entra al inventario`;
        okMessage = "Unidad en inventario";
      } else if (accion === "ubicacion") {
        await tx.compraUnidad.update({ where: { id: unidad.id }, data: { ubicacion: datos.ubicacion } });
        summary = `Movió una unidad de ${nombre} de ${lugar(unidad.ubicacion)} a ${lugar(datos.ubicacion)}`;
        okMessage = "Ubicación cambiada";
      } else if (accion === "color") {
        await tx.compraUnidad.update({ where: { id: unidad.id }, data: { color: datos.color } });
        summary = `Cambió el color de una unidad de ${nombre}: ${unidad.color ?? "sin color"} → ${datos.color}`;
        okMessage = "Color cambiado";
      } else {
        const venta = await tx.order.findUnique({
          where: { id: datos.saleOrderId! },
          select: { id: true, code: true, type: true, status: true },
        });
        if (!venta || venta.type !== "SALE" || venta.status === "CANCELLED") {
          throw new LotError("Elige una orden de venta que no esté cancelada");
        }
        await tx.compraUnidad.update({ where: { id: unidad.id }, data: { estado: "VENDIDA", saleOrderId: venta.id } });
        summary = `Marcó una unidad de ${nombre} como vendida en ${displayCode(venta.code)}`;
        okMessage = "Unidad marcada como vendida";
      }

      await logActivityTx(tx, actor, {
        action: "UPDATE",
        entityType: "PURCHASE",
        entityId: unidad.orderId,
        entityCode: codigo,
        summary: `${summary} (lote ${displayCode(codigo) ?? ""})`,
        before: { unidad: unidad.id, estado: unidad.estado, ubicacion: unidad.ubicacion, color: unidad.color },
        after: { unidad: unidad.id, accion, ...datos },
      });
    });
  } catch (error) {
    if (error instanceof LotError) back("error", error.message);
    throw error;
  }

  revalidatePath(LOTES_PATH);
  if (accion === "llego") revalidatePath("/admin/inventario");
  back("ok", okMessage);
}

export async function lotStartManufacturingAction(formData: FormData): Promise<void> {
  await runLotAction(formData, "fabricar");
}

export async function lotArrivedAction(formData: FormData): Promise<void> {
  await runLotAction(formData, "llego");
}

export async function lotChangeLocationAction(formData: FormData): Promise<void> {
  await runLotAction(formData, "ubicacion");
}

export async function lotEditColorAction(formData: FormData): Promise<void> {
  await runLotAction(formData, "color");
}

export async function lotSoldAction(formData: FormData): Promise<void> {
  await runLotAction(formData, "vendida");
}
