"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { snapshotForLog } from "@/lib/activity-log-snapshot";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";

function getReturnTo(formData: FormData): string {
  const raw = String(formData.get("returnTo") ?? "").trim().split("?")[0];
  return raw.startsWith("/admin/ordenes") ? raw : "/admin/ordenes";
}

function redirectWith(returnTo: string, key: "ok" | "error", message: string): never {
  redirect(`${returnTo}?${new URLSearchParams({ [key]: message }).toString()}`);
}

// Guarda fecha de entrega, direccion de despacho y notas de una orden de fabricacion.
export async function adminUpdateManufacturingOrderAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !(await hasAnyModuleAccess(session.user.id, session.user.role, ["orders"]))) {
    redirect("/unauthorized");
  }

  const returnTo = getReturnTo(formData);
  const id = String(formData.get("manufacturingOrderId") ?? "").trim();
  if (!id) {
    redirectWith(returnTo, "error", "Orden de fabricación inválida");
  }

  const dateRaw = String(formData.get("deliveryDate") ?? "").trim();
  let deliveryDate: Date | null = null;
  if (dateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      redirectWith(returnTo, "error", "Fecha de entrega inválida");
    }
    // Dia de calendario guardado como medianoche UTC (se muestra en UTC).
    deliveryDate = new Date(`${dateRaw}T00:00:00.000Z`);
  }

  const deliveryAddress = String(formData.get("deliveryAddress") ?? "").trim().slice(0, 300) || null;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;

  const LOG_FIELDS = ["deliveryDate", "deliveryAddress", "notes"] as const;
  let log: { code: string; orderId: string; before: ReturnType<typeof snapshotForLog> } | null = null;
  try {
    const before = await prisma.manufacturingOrder.findUnique({
      where: { id },
      select: { code: true, orderId: true, deliveryDate: true, deliveryAddress: true, notes: true },
    });
    if (before) {
      await prisma.manufacturingOrder.update({
        where: { id },
        data: { deliveryDate, deliveryAddress, notes },
      });
      log = { code: before.code, orderId: before.orderId, before: snapshotForLog(before, LOG_FIELDS) };
    }
  } catch {
    log = null;
  }

  if (!log) {
    redirectWith(returnTo, "error", "No se pudo guardar la orden de fabricación");
  }

  await logActivity({
    action: "UPDATE",
    entityType: "ORDER",
    entityId: log.orderId,
    entityCode: log.code,
    summary: `Editó la orden de fabricación ${log.code}`,
    before: log.before,
    after: snapshotForLog({ deliveryDate, deliveryAddress, notes }, LOG_FIELDS),
  });

  revalidatePath(returnTo);
  redirectWith(returnTo, "ok", "Orden de fabricación actualizada");
}
