"use server";

import type { ShipmentIncident, ShipmentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { hasUploadedFile, saveShipmentPhoto } from "@/lib/upload-photo";
import { normalizeShipmentCodeInput } from "@/modules/guias/domain/codes";
import { LOOKUP_BLOCKED_ERROR, LOOKUP_GENERIC_ERROR, parseLast4Input } from "@/modules/guias/domain/lookup";
import {
  CARRIER_INCIDENT_ACTIONS,
  CARRIER_STATUS_ACTIONS,
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_LABEL,
} from "@/modules/guias/domain/statuses";
import { hashIp, lookupShipment, type PublicShipmentView } from "@/modules/guias/infrastructure/shipment-lookup";
import {
  addShipmentEvent,
  findShipmentByCarrierToken,
  searchShipmentCities,
  ShipmentError,
  type CityOption,
} from "@/modules/guias/infrastructure/shipments-repository";

// Acciones publicas (sin cuenta): consulta de la guia y enlace del transportador.

async function clientIpHash(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || list.get("x-real-ip")?.trim() || "unknown";
  return hashIp(ip);
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// --- Consulta publica (magilus.com/guia) ---

export type LookupState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "ok"; view: PublicShipmentView };

export async function publicLookupShipmentAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const code = normalizeShipmentCodeInput(text(formData, "code"));
  const last4 = parseLast4Input(text(formData, "last4"));
  if (!code) {
    return { status: "error", error: "Escribe el número de guía (por ejemplo MG-000123)." };
  }
  if (!last4) {
    return { status: "error", error: "Escribe los últimos 4 dígitos de tu celular." };
  }
  try {
    const outcome = await lookupShipment({ code, last4, ipHash: await clientIpHash() });
    if (!outcome.ok) {
      return { status: "error", error: outcome.reason === "BLOCKED" ? LOOKUP_BLOCKED_ERROR : LOOKUP_GENERIC_ERROR };
    }
    return { status: "ok", view: outcome.view };
  } catch (error) {
    console.error("[guias] Fallo la consulta publica:", error);
    return { status: "error", error: "No pudimos consultar la guía. Intenta de nuevo en un momento." };
  }
}

// --- Enlace del transportador (/envios/t/[token]) ---

export type CarrierReportState = { status: "idle" } | { status: "error"; error: string } | { status: "ok"; message: string };

export async function carrierSearchCitiesAction(token: string, term: string): Promise<CityOption[]> {
  if (typeof token !== "string" || typeof term !== "string") {
    return [];
  }
  const shipment = await findShipmentByCarrierToken(token);
  if (!shipment) {
    return [];
  }
  return searchShipmentCities(term.slice(0, 80), 8);
}

export async function carrierReportAction(_prev: CarrierReportState, formData: FormData): Promise<CarrierReportState> {
  const token = text(formData, "token");
  const kind = text(formData, "kind");
  const status = text(formData, "status") as ShipmentStatus;
  const incident = text(formData, "incident") as ShipmentIncident;

  const shipment = await findShipmentByCarrierToken(token);
  if (!shipment) {
    return { status: "error", error: "Este enlace ya no está activo. Comunícate con Magilus." };
  }
  if (kind === "STATUS" && !CARRIER_STATUS_ACTIONS.includes(status)) {
    return { status: "error", error: "Etapa no válida." };
  }
  if (kind === "INCIDENT" && !CARRIER_INCIDENT_ACTIONS.includes(incident)) {
    return { status: "error", error: "Novedad no válida." };
  }
  if (kind !== "STATUS" && kind !== "INCIDENT") {
    return { status: "error", error: "Acción no válida." };
  }

  const cityId = text(formData, "cityId");
  if (!cityId) {
    return { status: "error", error: "Elige la ciudad donde estás." };
  }
  const note = text(formData, "note");
  if (kind === "INCIDENT" && incident === "OTHER" && !note) {
    return { status: "error", error: "Cuéntanos cuál es la novedad." };
  }

  const delivering = kind === "STATUS" && status === "DELIVERED";
  const photo = formData.get("photo");
  const receivedByName = text(formData, "receivedByName");
  if (delivering) {
    if (!hasUploadedFile(photo)) {
      return { status: "error", error: "Toma la foto del pedido entregado." };
    }
    if (!receivedByName) {
      return { status: "error", error: "Escribe el nombre de quien recibió." };
    }
    if (shipment.collectOnDelivery && Number(shipment.amountToCollect) > 0 && formData.get("collected") !== "on") {
      return { status: "error", error: "Confirma que recibiste el pago." };
    }
  }

  try {
    const photoUrl = hasUploadedFile(photo) ? (await saveShipmentPhoto(photo)).url : null;
    const collectedNote =
      delivering && shipment.collectOnDelivery && Number(shipment.amountToCollect) > 0
        ? `Cobró $${Number(shipment.amountToCollect).toLocaleString("es-CO")} al entregar`
        : "";
    await addShipmentEvent({
      shipmentId: shipment.id,
      actor: "CARRIER",
      actorLabel: text(formData, "driverName") || null,
      ipHash: await clientIpHash(),
      kind,
      status: kind === "STATUS" ? status : null,
      incident: kind === "INCIDENT" ? incident : null,
      note: [note, collectedNote].filter(Boolean).join(" · ") || null,
      cityId,
      photoUrl,
      visibleToClient: true,
      receivedByName: delivering ? receivedByName : null,
    });
  } catch (error) {
    if (error instanceof ShipmentError || (error instanceof Error && /foto/i.test(error.message))) {
      return { status: "error", error: error.message };
    }
    console.error("[guias] Fallo el reporte del transportador:", error);
    return { status: "error", error: "No se pudo guardar. Revisa tu conexión e intenta de nuevo." };
  }

  revalidatePath(`/envios/t/${token}`);
  revalidatePath("/admin/despachos/guias");
  revalidatePath(`/admin/despachos/guias/${shipment.id}`);
  const label = kind === "STATUS" ? SHIPMENT_STATUS_LABEL[status] : SHIPMENT_INCIDENT_LABEL[incident];
  return { status: "ok", message: `Listo, quedó: ${label}.` };
}
