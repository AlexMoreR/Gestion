import type { Prisma } from "@prisma/client";
import { abbreviateName } from "./lookup";
import {
  flowProgress,
  SHIPMENT_FLOW,
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_CLIENT_TEXT,
  SHIPMENT_STATUS_LABEL,
} from "./statuses";

// Vista publica de la guia: lo que sale de aqui es TODO lo que ve el cliente, tanto en la
// consulta con los 4 digitos (/guia) como en el enlace directo (/guia/[token]). Nunca
// transportadora, guia del proveedor, telefono completo, direccion ni notas internas.
// Puro (sin Prisma en tiempo de ejecucion) para poder probarlo.

export type PublicShipmentEvent = {
  id: string;
  at: string; // ISO
  title: string;
  detail: string | null;
  city: string | null;
};

export type PublicShipmentView = {
  code: string;
  status: string;
  statusLabel: string;
  statusText: string;
  progress: number;
  steps: { label: string; done: boolean }[];
  originCity: string;
  currentCity: string | null;
  destinationCity: string | null;
  recipientName: string | null; // nombre del destinatario (sin apellidos completos)
  phoneMasked: string | null; // "*** *** 1234", nunca el celular completo
  estimatedDelivery: string | null; // AAAA-MM-DD
  etaChanged: boolean;
  amountToCollect: number; // 0 = nada que pagar
  weightKg: number | null; // peso del envio en kg (null = por confirmar)
  deliveredAt: string | null;
  receivedBy: string | null;
  deliveryPhotoUrl: string | null;
  events: PublicShipmentEvent[];
};

// Campos que se leen de la BD para la vista publica (id solo para verificar el enlace firmado).
export const publicShipmentSelect = {
  id: true,
  code: true,
  status: true,
  phoneLast4: true,
  publicEnabled: true,
  estimatedDelivery: true,
  collectOnDelivery: true,
  amountToCollect: true,
  weightKg: true,
  deliveredAt: true,
  receivedByName: true,
  deliveryPhotoUrl: true,
  originCity: { select: { name: true } },
  currentCity: { select: { name: true } },
  destinationCity: { select: { name: true } },
  dispatch: { select: { order: { select: { client: { select: { name: true } } } } } },
  events: {
    where: { visibleToClient: true },
    orderBy: { occurredAt: "desc" },
    take: 50,
    select: {
      id: true,
      kind: true,
      status: true,
      incident: true,
      note: true,
      actor: true,
      newEta: true,
      occurredAt: true,
      city: { select: { name: true } },
    },
  },
} satisfies Prisma.ShipmentSelect;

export type PublicShipmentRow = Prisma.ShipmentGetPayload<{ select: typeof publicShipmentSelect }>;

function formatDay(date: Date): string {
  return date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function toPublicView(shipment: PublicShipmentRow): PublicShipmentView {
  const flowIndex = SHIPMENT_FLOW.indexOf(shipment.status);
  const delivered = shipment.status === "DELIVERED";
  const amount = Number(shipment.amountToCollect);
  const weight = shipment.weightKg == null ? null : Number(shipment.weightKg);

  return {
    code: shipment.code,
    status: shipment.status,
    statusLabel: SHIPMENT_STATUS_LABEL[shipment.status],
    statusText: SHIPMENT_STATUS_CLIENT_TEXT[shipment.status],
    progress: flowProgress(shipment.status),
    steps: SHIPMENT_FLOW.filter((step) => step !== "IN_WAREHOUSE").map((step) => ({
      label: SHIPMENT_STATUS_LABEL[step],
      done: flowIndex >= 0 && SHIPMENT_FLOW.indexOf(step) <= flowIndex,
    })),
    originCity: shipment.originCity?.name ?? "Bogotá",
    currentCity: shipment.currentCity?.name ?? null,
    destinationCity: shipment.destinationCity?.name ?? null,
    recipientName: abbreviateName(shipment.dispatch?.order?.client?.name) || null,
    phoneMasked: shipment.phoneLast4 ? `*** *** ${shipment.phoneLast4}` : null,
    estimatedDelivery: shipment.estimatedDelivery ? shipment.estimatedDelivery.toISOString().slice(0, 10) : null,
    etaChanged: shipment.events.some((event) => event.kind === "ETA_CHANGE"),
    amountToCollect: shipment.collectOnDelivery && !delivered && Number.isFinite(amount) ? Math.max(0, amount) : 0,
    weightKg: weight != null && Number.isFinite(weight) && weight > 0 ? weight : null,
    deliveredAt: shipment.deliveredAt ? shipment.deliveredAt.toISOString() : null,
    receivedBy: delivered ? abbreviateName(shipment.receivedByName) || null : null,
    deliveryPhotoUrl: delivered ? shipment.deliveryPhotoUrl : null,
    events: shipment.events.map((event) => ({
      id: event.id,
      at: event.occurredAt.toISOString(),
      title:
        event.kind === "STATUS" && event.status
          ? SHIPMENT_STATUS_LABEL[event.status]
          : event.kind === "INCIDENT" && event.incident
            ? `Novedad: ${SHIPMENT_INCIDENT_LABEL[event.incident]}`
            : event.kind === "ETA_CHANGE"
              ? "Nueva fecha estimada"
              : "Actualización",
      // Solo las notas que escribe Magilus (las del transportador pueden traer datos personales).
      detail:
        event.kind === "ETA_CHANGE" && event.newEta
          ? [formatDay(event.newEta), event.actor === "MAGILUS" ? event.note : null].filter(Boolean).join(" · ")
          : event.actor === "MAGILUS"
            ? event.note
            : null,
      city: event.city?.name ?? null,
    })),
  };
}
