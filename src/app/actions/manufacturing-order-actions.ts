"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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

  let updated = false;
  try {
    await prisma.manufacturingOrder.update({
      where: { id },
      data: { deliveryDate, deliveryAddress, notes },
    });
    updated = true;
  } catch {
    updated = false;
  }

  if (!updated) {
    redirectWith(returnTo, "error", "No se pudo guardar la orden de fabricación");
  }

  revalidatePath(returnTo);
  redirectWith(returnTo, "ok", "Orden de fabricación actualizada");
}
