"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildProductionJobCode, parseProductionJobCodeNumber } from "@/lib/orders";
import { syncOrderStatusAfterProduction } from "@/app/actions/orders-actions";

const createProductionJobSchema = z.object({
  orderId: z.string().trim().min(1, "Orden invalida"),
  orderItemId: z.string().trim().optional(),
  quantity: z.coerce.number().int().positive("Cantidad invalida"),
  notes: z.string().trim().max(4000, "Notas demasiado largas").optional(),
  dueDate: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
});

const updateProductionJobStatusSchema = z.object({
  productionJobId: z.string().trim().min(1, "Trabajo invalido"),
  status: z.enum(["PENDING", "IN_PROGRESS", "PAUSED", "DONE", "CANCELLED"]),
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
      return ["IN_PROGRESS", "CANCELLED"];
    case "IN_PROGRESS":
      return ["PAUSED", "DONE", "CANCELLED"];
    case "PAUSED":
      return ["IN_PROGRESS", "DONE", "CANCELLED"];
    case "DONE":
    case "CANCELLED":
      return [];
    default:
      return [];
  }
}

async function getNextProductionJobCode(tx: Prisma.TransactionClient): Promise<string> {
  const lastJob = await tx.productionJob.findFirst({
    select: { code: true },
    orderBy: { code: "desc" },
  });

  const baseCodeNumber = lastJob ? parseProductionJobCodeNumber(lastJob.code) : 0;

  for (let offset = 0; offset < 30; offset += 1) {
    const code = buildProductionJobCode(baseCodeNumber + 1 + offset);
    const existing = await tx.productionJob.findUnique({ where: { code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to allocate production job code");
}

export async function adminCreateProductionJobAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/produccion");

  const parsed = createProductionJobSchema.safeParse({
    orderId: formData.get("orderId"),
    orderItemId: formData.get("orderItemId") || undefined,
    quantity: formData.get("quantity"),
    notes: formData.get("notes") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+produccion+invalidos`);
  }

  const dueDate =
    parsed.data.dueDate && parsed.data.dueDate.length > 0 ? new Date(parsed.data.dueDate) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    redirect(`${returnTo}?error=Fecha+de+entrega+invalida`);
  }

  if (parsed.data.assignedToId) {
    const assigned = await prisma.user.findFirst({
      where: {
        id: parsed.data.assignedToId,
        role: { in: ["ADMIN", "EMPLEADO"] },
      },
      select: { id: true },
    });

    if (!assigned) {
      redirect(`${returnTo}?error=Responsable+invalido`);
    }
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: {
      items: true,
    },
  });

  if (!order) {
    redirect(`${returnTo}?error=Orden+no+encontrada`);
  }

  if (order.status === "CANCELLED" || order.status === "COMPLETED" || order.status === "DISPATCHED") {
    redirect(`${returnTo}?error=La+orden+no+acepta+produccion`);
  }

  if (parsed.data.orderItemId) {
    const belongsToOrder = order.items.some((item) => item.id === parsed.data.orderItemId);
    if (!belongsToOrder) {
      redirect(`${returnTo}?error=Producto+de+orden+invalido`);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const code = await getNextProductionJobCode(tx);
      await tx.productionJob.create({
        data: {
          code,
          orderId: order.id,
          orderItemId: parsed.data.orderItemId || null,
          status: "PENDING",
          quantity: parsed.data.quantity,
          notes: parsed.data.notes || null,
          dueDate,
          assignedToId: parsed.data.assignedToId || null,
          createdById: changedById,
        },
      });

      if (order.status === "DRAFT" || order.status === "RELEASED") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "IN_PRODUCTION" },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "IN_PRODUCTION",
            note: "Trabajo de produccion creado",
            changedById,
          },
        });
      }
    });
  } catch (error) {
    console.error("Failed to create production job:", error);
    redirect(`${returnTo}?error=No+se+pudo+crear+el+trabajo+de+produccion`);
  }

  revalidatePath("/admin/produccion");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${order.id}`);
  redirect(`${returnTo}?ok=Trabajo+creado`);
}

export async function adminUpdateProductionJobStatusAction(formData: FormData): Promise<void> {
  const changedById = await requireAdminSession();
  const returnTo = getReturnTo(formData, "/admin/produccion");

  const parsed = updateProductionJobStatusSchema.safeParse({
    productionJobId: formData.get("productionJobId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    redirect(`${returnTo}?error=Datos+de+produccion+invalidos`);
  }

  const job = await prisma.productionJob.findUnique({
    where: { id: parsed.data.productionJobId },
    include: { order: true },
  });

  if (!job) {
    redirect(`${returnTo}?error=Trabajo+no+encontrado`);
  }

  const allowedTransitions = parseAllowedTransitions(job.status);
  if (!allowedTransitions.includes(parsed.data.status)) {
    redirect(`${returnTo}?error=Transicion+de+produccion+invalida`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.productionJob.update({
      where: { id: job.id },
      data: {
        status: parsed.data.status,
        startedAt: parsed.data.status === "IN_PROGRESS" ? new Date() : job.startedAt,
        completedAt: parsed.data.status === "DONE" ? new Date() : job.completedAt,
      },
    });

    if (parsed.data.status === "DONE") {
      await syncOrderStatusAfterProduction(tx, job.orderId, changedById);
    }
  });

  revalidatePath("/admin/produccion");
  revalidatePath("/admin/ordenes");
  revalidatePath(`/admin/ordenes/${job.orderId}`);
  redirect(`${returnTo}?ok=Trabajo+actualizado`);
}

