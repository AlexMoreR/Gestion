"use server";

import { hasAnyModuleAccess } from "@/lib/admin-module-access";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { isRetiredUser } from "@/modules/equipo/infrastructure/prisma-team-repository";
import { createSaleOrder, type CreateSaleOrderMotivo, type CreateSaleOrderResult } from "@/lib/sale-order";

const CREATE_ORDER_ERRORS: Record<CreateSaleOrderMotivo, string> = {
  venta_no_encontrada: "Venta+no+encontrada",
  ya_tiene_orden: "Esta+venta+ya+tiene+una+orden",
  responsable_invalido: "Responsable+invalido",
  responsable_retirado: "Esa+persona+ya+salio+del+equipo",
};

const createOrderSchema = z.object({
  saleId: z.string().trim().min(1, "Venta invalida"),
  internalNotes: z.string().trim().max(4000, "Notas demasiado largas").optional(),
  assignedToId: z.string().trim().optional(),
});

const updateOrderStatusSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  status: z.enum([
    "DRAFT",
    "RELEASED",
    "IN_PRODUCTION",
    "READY_FOR_DISPATCH",
    "DISPATCHED",
    "COMPLETED",
    "CANCELLED",
  ]),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
});

const assignOrderSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  assignedToId: z.string().trim().min(1, "Responsable invalido"),
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

function parseAllowedOrderStatusTransitions(status: string): string[] {
  switch (status) {
    case "DRAFT":
      return ["RELEASED", "CANCELLED"];
    case "RELEASED":
      return ["IN_PRODUCTION", "CANCELLED"];
    case "IN_PRODUCTION":
      return ["READY_FOR_DISPATCH", "CANCELLED"];
    case "READY_FOR_DISPATCH":
      return ["DISPATCHED", "CANCELLED"];
    case "DISPATCHED":
      return ["COMPLETED", "CANCELLED"];
    case "COMPLETED":
    case "CANCELLED":
      return [];
    default:
      return [];
  }
}

export async function syncOrderStatusAfterProduction(
  tx: Prisma.TransactionClient,
  orderId: string,
  changedById: string,
): Promise<boolean> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });

  if (!order || order.status === "CANCELLED" || order.status === "COMPLETED" || order.status === "DISPATCHED") {
    return false;
  }

  const jobs = await tx.productionJob.findMany({
    where: { orderId },
    select: { status: true },
  });

  if (jobs.length === 0) {
    return false;
  }

  const hasOpenJobs = jobs.some((job) => job.status === "PENDING" || job.status === "IN_PROGRESS" || job.status === "PAUSED");
  const hasDoneJobs = jobs.some((job) => job.status === "DONE");

  if (!hasOpenJobs && hasDoneJobs) {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "READY_FOR_DISPATCH",
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: "READY_FOR_DISPATCH",
        note: "Produccion completada",
        changedById,
      },
    });
    return true;
  }

  return false;
}

export async function adminCreateOrderFromSaleAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ventas");

  const parsed = createOrderSchema.safeParse({
    saleId: formData.get("saleId"),
    internalNotes: formData.get("internalNotes") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+orden+invalidos`);
  }

  let result: CreateSaleOrderResult;
  try {
    result = await prisma.$transaction((tx) =>
      createSaleOrder(tx, {
        saleId: parsed.data.saleId,
        actorId: createdById,
        assigneeId: parsed.data.assignedToId,
        internalNotes: parsed.data.internalNotes,
      }),
    );
  } catch (error) {
    console.error("Failed to create order:", error);
    redirect(`${returnTo}?error=No+se+pudo+crear+la+orden`);
  }

  if (!result.ok) {
    redirect(`${returnTo}?error=${CREATE_ORDER_ERRORS[result.motivo]}`);
  }

  await logActivity({
    action: "CREATE",
    entityType: "ORDER",
    entityId: result.orderId,
    summary: `Creó la orden ${result.orderCode}`,
  });

  revalidatePath("/admin/ventas");
  revalidatePath("/admin/ordenes");
  redirect(`${returnTo}?ok=Orden+creada`);
}

export async function adminUpdateOrderStatusAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = updateOrderStatusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+orden+invalidos`);
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    select: { id: true, status: true, createdById: true, code: true },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  const allowedTransitions = parseAllowedOrderStatusTransitions(order.status);
  if (!allowedTransitions.includes(parsed.data.status)) {
    redirect(`${returnTo}?error=Transicion+de+estado+invalida`);
  }

  const updateData: Record<string, unknown> = {
    status: parsed.data.status,
  };

  if (parsed.data.status === "RELEASED") {
    updateData.releasedAt = new Date();
  }

  if (parsed.data.status === "COMPLETED") {
    updateData.completedAt = new Date();
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: updateData,
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: parsed.data.status,
        note: parsed.data.note || null,
        changedById,
      },
    });
  });

  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: order.id,
    summary: `Actualizó la orden ${order.code} a estado ${parsed.data.status}`,
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${order.id}`);
  redirect(`${returnTo}?ok=Orden+actualizada`);
}

export async function adminAssignOrderAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const parsed = assignOrderSchema.safeParse({
    orderId: formData.get("orderId"),
    assignedToId: formData.get("assignedToId"),
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+asignacion+invalidos`);
  }

  const isValid = await prisma.user.findFirst({
    where: {
      id: parsed.data.assignedToId,
      role: { in: ["ADMIN", "EMPLEADO"] },
    },
    select: { id: true },
  });

  if (!isValid) {
    redirect(`${returnTo}?error=Responsable+invalido`);
  }
  if (await isRetiredUser(isValid.id)) {
    redirect(`${returnTo}?error=Esa+persona+ya+salio+del+equipo`);
  }

  const assignedOrder = await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: { assignedToId: parsed.data.assignedToId },
    select: { code: true },
  });

  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: parsed.data.orderId,
    summary: `Asignó la orden ${assignedOrder.code}`,
  });

  revalidatePath("/admin/ordenes");
  revalidatePath(`${returnTo}`);
  redirect(`${returnTo}?ok=Orden+asignada`);
}

export async function adminCancelOrderAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/ordenes");

  const orderId = String(formData.get("orderId") || "").trim();
  const note = String(formData.get("note") || "").trim() || null;

  if (!orderId) {
    redirect(`${returnTo}?error=Orden+invalida`);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      code: true,
      items: {
        select: { productId: true, quantity: true, fulfillmentMode: true, confirmedAt: true },
      },
    },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    redirect(`${returnTo}?error=La+orden+no+puede+cancelarse`);
  }

  // Repone el inventario de los items "por stock" que ya se habian confirmado
  // (su salida OUT se registro al confirmar). Los no confirmados nunca tocaron
  // stock y los de fabricacion tampoco.
  const restoreByProduct = new Map<string, number>();
  for (const item of order.items) {
    if (item.fulfillmentMode === "STOCK" && item.confirmedAt !== null) {
      restoreByProduct.set(item.productId, (restoreByProduct.get(item.productId) ?? 0) + item.quantity);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "CANCELLED",
        note,
        changedById,
      },
    });

    if (restoreByProduct.size > 0) {
      await tx.inventoryMovement.createMany({
        data: Array.from(restoreByProduct.entries()).map(([productId, quantity]) => ({
          productId,
          type: "IN" as const,
          change: quantity,
          note: `Reversa por cancelacion de orden ${order.code}`,
          createdById: changedById,
        })),
      });
    }
  });

  await logActivity({
    action: "DELETE",
    entityType: "ORDER",
    entityId: order.id,
    summary: `Canceló la orden ${order.code}`,
  });

  revalidatePath("/admin/ordenes");
  if (restoreByProduct.size > 0) {
    revalidatePath("/admin/inventario");
  }
  revalidatePath(`${returnTo}`);
  redirect(`${returnTo}?ok=Orden+cancelada`);
}

export async function adminMoveOrderToReadyForDispatchAction(orderId: string): Promise<void> {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("status", "READY_FOR_DISPATCH");
  formData.set("returnTo", `/admin/ordenes/${orderId}`);
  await adminUpdateOrderStatusAction(formData);
}

export async function adminMoveOrderToProductionAction(orderId: string): Promise<void> {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("status", "IN_PRODUCTION");
  formData.set("returnTo", `/admin/ordenes/${orderId}`);
  await adminUpdateOrderStatusAction(formData);
}

export async function adminMoveOrderToDispatchedAction(orderId: string): Promise<void> {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("status", "DISPATCHED");
  formData.set("returnTo", `/admin/ordenes/${orderId}`);
  await adminUpdateOrderStatusAction(formData);
}

export async function adminMoveOrderToCompletedAction(orderId: string): Promise<void> {
  const formData = new FormData();
  formData.set("orderId", orderId);
  formData.set("status", "COMPLETED");
  formData.set("returnTo", `/admin/ordenes/${orderId}`);
  await adminUpdateOrderStatusAction(formData);
}
