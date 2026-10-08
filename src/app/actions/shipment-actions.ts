"use server";

import type { ShipmentIncident, ShipmentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { hasAnyModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { hasUploadedFile, saveShipmentPhoto } from "@/lib/upload-photo";
import { parseDateInput } from "@/modules/guias/domain/eta";
import { ALL_SHIPMENT_INCIDENTS, ALL_SHIPMENT_STATUSES, SHIPMENT_STATUS_LABEL } from "@/modules/guias/domain/statuses";
import { formatWeightKg, parseWeightKg } from "@/modules/guias/domain/weight";
import {
  addShipmentEvent,
  createShipmentForDispatch,
  generateCarrierToken,
  searchShipmentCities,
  ShipmentError,
  updateShipmentDestination,
  updateShipmentEta,
  type CityOption,
} from "@/modules/guias/infrastructure/shipments-repository";

// Acciones internas de las guias Magilus (Gestion). Mismo permiso que despachos.

const GUIAS_PATH = "/admin/despachos/guias";

async function requireShipmentsAccess(): Promise<{ id: string; label: string }> {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await hasAnyModuleAccess(session.user.id, session.user.role, ["dispatches", "orders"]))
  ) {
    redirect("/unauthorized");
  }
  return { id: session.user.id, label: session.user.name || session.user.email || "Magilus" };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function detailPath(shipmentId: string): string {
  return `${GUIAS_PATH}/${shipmentId}`;
}

function withMessage(path: string, kind: "ok" | "error", message: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${kind}=${encodeURIComponent(message)}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ShipmentError) {
    return error.message;
  }
  if (error instanceof Error && /foto/i.test(error.message)) {
    return error.message;
  }
  console.error("[guias]", error);
  return fallback;
}

function parseMoney(raw: string): number | null {
  if (!raw) {
    return null;
  }
  const value = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

async function revalidateShipment(shipmentId: string) {
  revalidatePath(GUIAS_PATH);
  revalidatePath(detailPath(shipmentId));
  revalidatePath("/admin/despachos");
  revalidatePath("/admin/despachos/transportadora");
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { dispatch: { select: { orderId: true } } },
  });
  if (shipment) {
    revalidatePath(`/admin/ordenes/${shipment.dispatch.orderId}`);
  }
}

// Buscador de ciudades (catalogo DANE) para los formularios internos.
export async function adminSearchShipmentCitiesAction(term: string): Promise<CityOption[]> {
  await requireShipmentsAccess();
  if (typeof term !== "string") {
    return [];
  }
  return searchShipmentCities(term.slice(0, 80));
}

// Crea la guia de un despacho que ya existe (boton "Crear guia Magilus").
export async function adminCreateShipmentAction(formData: FormData): Promise<void> {
  const user = await requireShipmentsAccess();
  const returnTo = text(formData, "returnTo") || GUIAS_PATH;
  const dispatchId = text(formData, "dispatchId");
  if (!dispatchId) {
    redirect(withMessage(returnTo, "error", "Despacho inválido"));
  }

  const weight = parseWeightKg(formData.get("weightKg"));
  if (!weight.ok) {
    redirect(withMessage(returnTo, "error", weight.error));
  }

  let created: { id: string; code: string } | null = null;
  let failure = "";
  try {
    created = await createShipmentForDispatch({
      dispatchId,
      createdById: user.id,
      destinationCityId: text(formData, "destinationCityId") || null,
      amountToCollect: parseMoney(text(formData, "amountToCollect")),
      weightKg: weight.value,
    });
  } catch (error) {
    failure = errorMessage(error, "No se pudo crear la guía");
  }
  if (!created) {
    redirect(withMessage(returnTo, "error", failure));
  }

  await logActivity({
    action: "CREATE",
    entityType: "SHIPMENT",
    entityId: created.id,
    summary: `Creó la guía ${created.code}`,
  });
  await revalidateShipment(created.id);
  redirect(withMessage(detailPath(created.id), "ok", `Guía ${created.code} creada`));
}

// Agrega una etapa, novedad o nota desde Gestion.
export async function adminAddShipmentEventAction(formData: FormData): Promise<void> {
  const user = await requireShipmentsAccess();
  const shipmentId = text(formData, "shipmentId");
  const back = detailPath(shipmentId);
  const kind = text(formData, "kind");
  const status = text(formData, "status") as ShipmentStatus;
  const incident = text(formData, "incident") as ShipmentIncident;

  if (!shipmentId || !["STATUS", "INCIDENT", "NOTE"].includes(kind)) {
    redirect(withMessage(back, "error", "Datos del evento inválidos"));
  }
  if (kind === "STATUS" && !ALL_SHIPMENT_STATUSES.includes(status)) {
    redirect(withMessage(back, "error", "Selecciona la etapa"));
  }
  if (kind === "INCIDENT" && !ALL_SHIPMENT_INCIDENTS.includes(incident)) {
    redirect(withMessage(back, "error", "Selecciona la novedad"));
  }

  let failure = "";
  try {
    const photo = formData.get("photo");
    const photoUrl = hasUploadedFile(photo) ? (await saveShipmentPhoto(photo)).url : null;
    await addShipmentEvent({
      shipmentId,
      actor: "MAGILUS",
      actorUserId: user.id,
      actorLabel: user.label,
      kind: kind as "STATUS" | "INCIDENT" | "NOTE",
      status: kind === "STATUS" ? status : null,
      incident: kind === "INCIDENT" ? incident : null,
      note: text(formData, "note") || null,
      cityId: text(formData, "cityId") || null,
      photoUrl,
      visibleToClient: formData.get("visibleToClient") === "on",
      receivedByName: text(formData, "receivedByName") || null,
    });
  } catch (error) {
    failure = errorMessage(error, "No se pudo guardar el evento");
  }
  if (failure) {
    redirect(withMessage(back, "error", failure));
  }

  await revalidateShipment(shipmentId);
  redirect(
    withMessage(back, "ok", kind === "STATUS" ? `Etapa: ${SHIPMENT_STATUS_LABEL[status]}` : "Evento guardado"),
  );
}

export async function adminUpdateShipmentEtaAction(formData: FormData): Promise<void> {
  const user = await requireShipmentsAccess();
  const shipmentId = text(formData, "shipmentId");
  const back = detailPath(shipmentId);
  const eta = parseDateInput(text(formData, "estimatedDelivery"));
  if (!shipmentId || !eta) {
    redirect(withMessage(back, "error", "Fecha inválida"));
  }

  let failure = "";
  try {
    await updateShipmentEta({
      shipmentId,
      estimatedDelivery: eta,
      note: text(formData, "note") || null,
      visibleToClient: formData.get("visibleToClient") === "on",
      actorUserId: user.id,
    });
  } catch (error) {
    failure = errorMessage(error, "No se pudo cambiar la fecha");
  }
  if (failure) {
    redirect(withMessage(back, "error", failure));
  }

  await logActivity({
    action: "UPDATE",
    entityType: "SHIPMENT",
    entityId: shipmentId,
    summary: `Cambió la fecha estimada de la guía a ${eta.toISOString().slice(0, 10)}`,
  });
  await revalidateShipment(shipmentId);
  redirect(withMessage(back, "ok", "Fecha estimada actualizada"));
}

export async function adminUpdateShipmentDestinationAction(formData: FormData): Promise<void> {
  await requireShipmentsAccess();
  const shipmentId = text(formData, "shipmentId");
  const back = detailPath(shipmentId);
  const cityId = text(formData, "cityId");
  if (!shipmentId || !cityId) {
    redirect(withMessage(back, "error", "Selecciona la ciudad destino"));
  }

  let failure = "";
  try {
    await updateShipmentDestination(shipmentId, cityId);
  } catch (error) {
    failure = errorMessage(error, "No se pudo cambiar el destino");
  }
  if (failure) {
    redirect(withMessage(back, "error", failure));
  }

  await logActivity({
    action: "UPDATE",
    entityType: "SHIPMENT",
    entityId: shipmentId,
    summary: "Cambió la ciudad destino de la guía",
  });
  await revalidateShipment(shipmentId);
  redirect(withMessage(back, "ok", "Destino actualizado"));
}

export async function adminUpdateShipmentCollectAction(formData: FormData): Promise<void> {
  await requireShipmentsAccess();
  const shipmentId = text(formData, "shipmentId");
  const back = detailPath(shipmentId);
  const amount = parseMoney(text(formData, "amountToCollect")) ?? 0;
  if (!shipmentId) {
    redirect(withMessage(back, "error", "Guía inválida"));
  }

  const shipment = await prisma.shipment.update({
    where: { id: shipmentId },
    data: { amountToCollect: amount, collectOnDelivery: amount > 0 },
    select: { code: true },
  });
  await logActivity({
    action: "UPDATE",
    entityType: "SHIPMENT",
    entityId: shipmentId,
    summary: `Cambió el cobro al recibir de ${shipment.code} a $${amount.toLocaleString("es-CO")}`,
  });
  await revalidateShipment(shipmentId);
  redirect(withMessage(back, "ok", "Cobro al recibir actualizado"));
}

// Peso del envio en kg (vacio = quitar el peso).
export async function adminUpdateShipmentWeightAction(formData: FormData): Promise<void> {
  await requireShipmentsAccess();
  const shipmentId = text(formData, "shipmentId");
  const back = detailPath(shipmentId);
  if (!shipmentId) {
    redirect(withMessage(back, "error", "Guía inválida"));
  }
  const weight = parseWeightKg(formData.get("weightKg"));
  if (!weight.ok) {
    redirect(withMessage(back, "error", weight.error));
  }

  const shipment = await prisma.shipment.update({
    where: { id: shipmentId },
    data: { weightKg: weight.value },
    select: { code: true },
  });
  await logActivity({
    action: "UPDATE",
    entityType: "SHIPMENT",
    entityId: shipmentId,
    summary:
      weight.value == null
        ? `Quitó el peso de la guía ${shipment.code}`
        : `Cambió el peso de ${shipment.code} a ${formatWeightKg(weight.value)}`,
  });
  await revalidateShipment(shipmentId);
  redirect(withMessage(back, "ok", weight.value == null ? "Peso quitado" : "Peso actualizado"));
}

// Cambia el enlace del transportador (el anterior deja de funcionar).
export async function adminRegenerateCarrierTokenAction(formData: FormData): Promise<void> {
  await requireShipmentsAccess();
  const shipmentId = text(formData, "shipmentId");
  const back = detailPath(shipmentId);
  if (!shipmentId) {
    redirect(withMessage(back, "error", "Guía inválida"));
  }
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { carrierToken: generateCarrierToken(), carrierTokenActive: true },
  });
  await logActivity({
    action: "UPDATE",
    entityType: "SHIPMENT",
    entityId: shipmentId,
    summary: "Regeneró el enlace del transportador",
  });
  await revalidateShipment(shipmentId);
  redirect(withMessage(back, "ok", "Enlace nuevo generado; el anterior ya no sirve"));
}

export async function adminSetCarrierLinkActiveAction(formData: FormData): Promise<void> {
  await requireShipmentsAccess();
  const shipmentId = text(formData, "shipmentId");
  const back = detailPath(shipmentId);
  const active = text(formData, "active") === "1";
  if (!shipmentId) {
    redirect(withMessage(back, "error", "Guía inválida"));
  }
  await prisma.shipment.update({ where: { id: shipmentId }, data: { carrierTokenActive: active } });
  await logActivity({
    action: "UPDATE",
    entityType: "SHIPMENT",
    entityId: shipmentId,
    summary: active ? "Activó el enlace del transportador" : "Desactivó el enlace del transportador",
  });
  await revalidateShipment(shipmentId);
  redirect(withMessage(back, "ok", active ? "Enlace activado" : "Enlace desactivado"));
}
