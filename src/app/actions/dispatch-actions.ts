"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildDispatchCode, parseDispatchCodeNumber } from "@/lib/orders";

const createDispatchSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  carrierName: z.string().trim().max(120, "Transportadora demasiado larga").optional(),
  trackingNumber: z.string().trim().max(120, "Guia demasiado larga").optional(),
  shippingAddress: z.string().trim().max(250, "Direccion demasiado larga").optional(),
  notes: z.string().trim().max(4000, "Notas demasiado largas").optional(),
});

const updateDispatchStatusSchema = z.object({
  dispatchId: z.string().trim().min(1, "Despacho invalido"),
  status: z.enum(["PENDING", "PACKING", "SHIPPED", "DELIVERED", "RETURNED", "CANCELLED"]),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
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

export async function adminCreateDispatchAction(formData: FormData): Promise<void> {
  const createdById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/despachos");

  const parsed = createDispatchSchema.safeParse({
    orderId: formData.get("orderId"),
    carrierName: formData.get("carrierName") || undefined,
    trackingNumber: formData.get("trackingNumber") || undefined,
    shippingAddress: formData.get("shippingAddress") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+despacho+invalidos`);
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: {
      items: true,
      dispatches: {
        where: {
          status: {
            in: ["PENDING", "PACKING", "SHIPPED"],
          },
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

  if (order.dispatches.length > 0) {
    redirect(`${returnTo}?error=Ya+existe+un+despacho+activo+para+esta+orden`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const code = await getNextDispatchCode(tx);
      await tx.dispatch.create({
        data: {
          code,
          orderId: order.id,
          status: "PACKING",
          carrierName: parsed.data.carrierName || null,
          trackingNumber: parsed.data.trackingNumber || null,
          shippingAddress: parsed.data.shippingAddress || null,
          notes: parsed.data.notes || null,
          createdById,
          items: {
            create: order.items.map((item) => ({
              orderItemId: item.id,
              quantity: item.quantity,
              notes: item.notes,
            })),
          },
        },
      });

      if (order.status !== "READY_FOR_DISPATCH") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "READY_FOR_DISPATCH" },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "READY_FOR_DISPATCH",
            note: "Despacho en preparacion",
            changedById: createdById,
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to create dispatch:", error);
    redirect(`${returnTo}?error=No+se+pudo+crear+el+despacho`);
  }

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${order.id}`);
  redirect(`${returnTo}?ok=Despacho+creado`);
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
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: dispatch.orderId,
          fromStatus: dispatch.order.status,
          toStatus: "COMPLETED",
          note: parsed.data.note || "Pedido entregado",
          changedById,
        },
      });
    }
  });

  revalidatePath("/admin/despachos");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${dispatch.orderId}`);
  redirect(`${returnTo}?ok=Despacho+actualizado`);
}

