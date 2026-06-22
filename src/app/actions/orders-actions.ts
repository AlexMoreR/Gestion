"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildOrderCode, parseOrderCodeNumber } from "@/lib/orders";
import { expandQuoteItemsToOrderItems } from "@/lib/order-items";

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
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
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

async function getNextOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  const lastOrder = await tx.order.findFirst({
    select: { code: true },
    orderBy: { code: "desc" },
  });

  const baseCodeNumber = lastOrder ? parseOrderCodeNumber(lastOrder.code) : 0;
  const maxAttempts = 30;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const code = buildOrderCode(baseCodeNumber + 1 + offset);
    const existing = await tx.order.findUnique({ where: { code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to allocate order code");
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

  const sale = await prisma.sale.findUnique({
    where: { id: parsed.data.saleId },
    include: {
      order: true,
      quote: {
        include: {
          items: {
            include: {
              product: {
                include: {
                  bundleComponents: {
                    orderBy: { sortOrder: "asc" },
                    include: { child: true },
                  },
                },
              },
            },
          },
        },
      },
      client: true,
    },
  });

  if (!sale) {
    redirect(`${returnTo}?error=Venta+no+encontrada`);
  }

  if (sale.order) {
    redirect(`${returnTo}?error=Esta+venta+ya+tiene+una+orden`);
  }

  if (parsed.data.assignedToId) {
    const validAssigned = await prisma.user.findFirst({
      where: {
        id: parsed.data.assignedToId,
        role: { in: ["ADMIN", "EMPLEADO"] },
      },
      select: { id: true },
    });

    if (!validAssigned) {
      redirect(`${returnTo}?error=Responsable+invalido`);
    }
  }

  const subtotal = Number(sale.total);
  const total = Number(sale.total);

  // Expande los combos en sus componentes para que la orden de fabricacion
  // muestre los subproductos reales y no el combo padre.
  const orderItemInputs = expandQuoteItemsToOrderItems(
    sale.quote.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      fulfillmentMode: item.fulfillmentMode,
      notes: item.notes,
      product: {
        name: item.product.name,
        isBundle: item.product.isBundle,
        bundleComponents: item.product.bundleComponents.map((component) => ({
          quantity: component.quantity,
          child: {
            id: component.child.id,
            name: component.child.name,
            code: component.child.code,
            price: Number(component.child.price),
          },
        })),
      },
    })),
  );

  try {
    await prisma.$transaction(async (tx) => {
      const code = await getNextOrderCode(tx);
      const order = await tx.order.create({
        data: {
          code,
          saleId: sale.id,
          quoteId: sale.quoteId,
          clientId: sale.clientId,
          createdById,
          assignedToId: parsed.data.assignedToId || null,
          status: "RELEASED",
          notes: sale.quote.notes,
          internalNotes: parsed.data.internalNotes || null,
          committedAt: new Date(),
          releasedAt: new Date(),
          subtotal: new Prisma.Decimal(subtotal),
          total: new Prisma.Decimal(total),
          items: {
            create: orderItemInputs,
          },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: "RELEASED",
          note: "Orden creada desde venta",
          changedById: createdById,
        },
      });

      // Las lineas "por stock" se surten de existencias: descuentan inventario
      // automaticamente (un movimiento OUT por producto). Las "por orden" se
      // fabrican y no tocan stock.
      const stockOutByProduct = new Map<string, number>();
      for (const input of orderItemInputs) {
        if (input.fulfillmentMode === "STOCK") {
          stockOutByProduct.set(
            input.productId,
            (stockOutByProduct.get(input.productId) ?? 0) + input.quantity,
          );
        }
      }

      if (stockOutByProduct.size > 0) {
        await tx.inventoryMovement.createMany({
          data: Array.from(stockOutByProduct.entries()).map(([productId, quantity]) => ({
            productId,
            type: "OUT" as const,
            change: -quantity,
            note: `Salida por orden ${code}`,
            createdById,
          })),
        });
      }
    });
  } catch (error) {
    console.error("Failed to create order:", error);
    redirect(`${returnTo}?error=No+se+pudo+crear+la+orden`);
  }

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
    select: { id: true, status: true, createdById: true },
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

  await prisma.order.update({
    where: { id: parsed.data.orderId },
    data: { assignedToId: parsed.data.assignedToId },
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
    select: { id: true, status: true },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    redirect(`${returnTo}?error=La+orden+no+puede+cancelarse`);
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
  });

  revalidatePath("/admin/ordenes");
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
