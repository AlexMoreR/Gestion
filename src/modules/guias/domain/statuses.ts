// Catalogo de etapas y novedades de la guia Magilus, reglas de avance y sincronia con el
// estado del despacho. Puro (solo tipos de Prisma).
import type { DispatchStatus, ShipmentIncident, ShipmentStatus } from "@prisma/client";

// Etapas que avanzan en orden. RETURNED y CANCELLED son finales fuera de la linea.
export const SHIPMENT_FLOW: readonly ShipmentStatus[] = [
  "CREATED",
  "PICKED_UP",
  "IN_WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export const SHIPMENT_STATUS_LABEL: Readonly<Record<ShipmentStatus, string>> = {
  CREATED: "Guía creada",
  PICKED_UP: "Recogido",
  IN_WAREHOUSE: "En bodega",
  IN_TRANSIT: "En ruta",
  OUT_FOR_DELIVERY: "En reparto",
  DELIVERED: "Entregado",
  RETURNED: "Devuelto",
  CANCELLED: "Anulada",
};

// Texto para el cliente en la consulta publica.
export const SHIPMENT_STATUS_CLIENT_TEXT: Readonly<Record<ShipmentStatus, string>> = {
  CREATED: "Estamos preparando tu pedido para el envío.",
  PICKED_UP: "Tu pedido salió de nuestra fábrica en Bogotá.",
  IN_WAREHOUSE: "Tu pedido está en bodega, listo para viajar.",
  IN_TRANSIT: "Tu pedido va en camino.",
  OUT_FOR_DELIVERY: "Tu pedido está en reparto: hoy llega.",
  DELIVERED: "Tu pedido fue entregado.",
  RETURNED: "Tu pedido regresó a Magilus. Escríbenos para coordinar.",
  CANCELLED: "Esta guía fue anulada. Escríbenos si tienes dudas.",
};

export const SHIPMENT_INCIDENT_LABEL: Readonly<Record<ShipmentIncident, string>> = {
  POLICE_INSPECTION: "Inspección policial",
  WEATHER: "Lluvias",
  HEAVY_TRAFFIC: "Alto tráfico",
  ROAD_BLOCK: "Vía cerrada / bloqueo",
  VEHICLE_ISSUE: "Falla del vehículo",
  ADDRESS_ISSUE: "Dirección incompleta",
  RECIPIENT_ABSENT: "No había quién recibiera",
  DAMAGE: "Daño o avería",
  OTHER: "Novedad",
};

export const ALL_SHIPMENT_STATUSES = Object.keys(SHIPMENT_STATUS_LABEL) as ShipmentStatus[];
export const ALL_SHIPMENT_INCIDENTS = Object.keys(SHIPMENT_INCIDENT_LABEL) as ShipmentIncident[];

// Botones del enlace del transportador (etapas y novedades rapidas).
export const CARRIER_STATUS_ACTIONS: readonly ShipmentStatus[] = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];
export const CARRIER_INCIDENT_ACTIONS: readonly ShipmentIncident[] = [
  "POLICE_INSPECTION",
  "WEATHER",
  "HEAVY_TRAFFIC",
  "OTHER",
];

export function isFinalShipmentStatus(status: ShipmentStatus): boolean {
  return status === "DELIVERED" || status === "RETURNED" || status === "CANCELLED";
}

export function flowIndex(status: ShipmentStatus): number {
  return SHIPMENT_FLOW.indexOf(status);
}

// Progreso para la barra de la consulta publica (0 a 1).
export function flowProgress(status: ShipmentStatus): number {
  const index = flowIndex(status);
  if (index < 0) {
    return 0;
  }
  return index / (SHIPMENT_FLOW.length - 1);
}

export type TransitionCheck = { ok: true } | { ok: false; error: string };

// El transportador solo avanza (puede saltar etapas) y no toca guias cerradas.
export function canCarrierMoveTo(current: ShipmentStatus, next: ShipmentStatus): TransitionCheck {
  if (isFinalShipmentStatus(current)) {
    return { ok: false, error: "Esta guía ya está cerrada." };
  }
  if (!CARRIER_STATUS_ACTIONS.includes(next)) {
    return { ok: false, error: "Etapa no permitida." };
  }
  if (flowIndex(next) <= flowIndex(current)) {
    return { ok: false, error: `La guía ya está en "${SHIPMENT_STATUS_LABEL[current]}".` };
  }
  return { ok: true };
}

// Magilus puede ir a cualquier etapa; retroceder (o reabrir) exige nota.
export function canMagilusMoveTo(current: ShipmentStatus, next: ShipmentStatus, note: string): TransitionCheck {
  if (current === next) {
    return { ok: false, error: "La guía ya está en esa etapa." };
  }
  const goingBack =
    isFinalShipmentStatus(current) ||
    (flowIndex(next) >= 0 && flowIndex(current) >= 0 && flowIndex(next) < flowIndex(current));
  if (goingBack && note.trim().length === 0) {
    return { ok: false, error: "Para retroceder o reabrir la guía escribe una nota." };
  }
  return { ok: true };
}

// Estado al que debe pasar el despacho cuando la guia cambia de etapa (null = no tocar).
// Solo avanza el despacho: nunca lo devuelve a un estado anterior.
export function dispatchStatusForShipment(
  shipmentStatus: ShipmentStatus,
  dispatchStatus: DispatchStatus,
): DispatchStatus | null {
  if (dispatchStatus === "CANCELLED" || dispatchStatus === "DELIVERED") {
    return null;
  }
  switch (shipmentStatus) {
    case "PICKED_UP":
    case "IN_WAREHOUSE":
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return dispatchStatus === "PENDING" || dispatchStatus === "PACKING" ? "SHIPPED" : null;
    case "DELIVERED":
      return "DELIVERED";
    case "RETURNED":
      return dispatchStatus === "SHIPPED" ? "RETURNED" : null;
    default:
      return null;
  }
}

export const SHIPMENT_STATUS_BADGE: Readonly<Record<ShipmentStatus, string>> = {
  CREATED: "border-border bg-muted text-muted-foreground",
  PICKED_UP: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-400",
  IN_WAREHOUSE: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-400",
  IN_TRANSIT: "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400",
  OUT_FOR_DELIVERY: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  DELIVERED: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  RETURNED: "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-400",
  CANCELLED: "border-destructive/30 bg-destructive/10 text-destructive",
};
