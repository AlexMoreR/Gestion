import type { Prisma, ShipmentIncident } from "@prisma/client";
import { estimateDelivery } from "./eta";
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
  // Solo si la fecha se corrio hacia adelante por una novedad visible: "Lluvias en la via". null = sin aviso.
  etaDelayReason: string | null;
  amountToCollect: number; // 0 = nada que pagar
  weightKg: number | null; // peso del envio en kg (null = por confirmar)
  deliveredAt: string | null;
  receivedBy: string | null;
  deliveryPhotoUrl: string | null;
  // Franja de "estado actual": ultima etapa o novedad (nunca un cambio de fecha ni una nota).
  currentEvent: PublicShipmentEvent | null;
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
  createdAt: true, // para la fecha automatica original (aviso de atraso)
  collectOnDelivery: true,
  amountToCollect: true,
  weightKg: true,
  deliveredAt: true,
  receivedByName: true,
  deliveryPhotoUrl: true,
  originCity: { select: { name: true } },
  currentCity: { select: { name: true } },
  destinationCity: { select: { name: true, code: true } },
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

// Como se nombra la novedad en el aviso de la fecha ("La fecha se movio por: ...").
const DELAY_REASON: Partial<Record<ShipmentIncident, string>> = {
  WEATHER: "Lluvias en la vía",
  OTHER: "una novedad en la vía",
};

type RowEvent = PublicShipmentRow["events"][number];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Aviso de la fecha: solo si el ultimo cambio de fecha la corrio MAS TARDE que la anterior y hubo
// una novedad visible registrada entre la fecha anterior y ese cambio. Si se adelanto o se movio
// a mano sin novedad, no hay aviso. `events` viene del mas nuevo al mas viejo.
export function etaDelayReason(
  events: readonly Pick<RowEvent, "kind" | "incident" | "newEta" | "occurredAt">[],
  baselineEta: Date | null,
): string | null {
  const etaChanges = events.filter((event) => event.kind === "ETA_CHANGE" && event.newEta);
  const latest = etaChanges[0];
  if (!latest?.newEta) {
    return null;
  }
  const previousChange = etaChanges[1];
  const previousEta = previousChange?.newEta ?? baselineEta;
  if (!previousEta || dayKey(latest.newEta) <= dayKey(previousEta)) {
    return null;
  }
  const since = previousChange?.occurredAt.getTime() ?? Number.NEGATIVE_INFINITY;
  const incident = events.find(
    (event) =>
      event.kind === "INCIDENT" &&
      event.incident &&
      event.occurredAt.getTime() <= latest.occurredAt.getTime() &&
      event.occurredAt.getTime() > since,
  );
  if (!incident?.incident) {
    return null;
  }
  return DELAY_REASON[incident.incident] ?? SHIPMENT_INCIDENT_LABEL[incident.incident];
}

export function toPublicView(shipment: PublicShipmentRow): PublicShipmentView {
  const flowIndex = SHIPMENT_FLOW.indexOf(shipment.status);
  const delivered = shipment.status === "DELIVERED";
  const amount = Number(shipment.amountToCollect);
  const weight = shipment.weightKg == null ? null : Number(shipment.weightKg);
  const toPublicEvent = (event: RowEvent): PublicShipmentEvent => ({
    id: event.id,
    at: event.occurredAt.toISOString(),
    title:
      event.kind === "STATUS" && event.status
        ? SHIPMENT_STATUS_LABEL[event.status]
        : event.kind === "INCIDENT" && event.incident
          ? `Novedad: ${SHIPMENT_INCIDENT_LABEL[event.incident]}`
          : event.kind === "ETA_CHANGE"
            ? event.newEta
              ? `Fecha estimada actualizada: ${formatDay(event.newEta)}`
              : "Fecha estimada actualizada"
            : "Actualización",
    // Solo las notas que escribe Magilus (las del transportador pueden traer datos personales).
    detail: event.actor === "MAGILUS" ? event.note : null,
    city: event.city?.name ?? null,
  });
  const current = shipment.events.find(
    (event) => (event.kind === "STATUS" && event.status) || (event.kind === "INCIDENT" && event.incident),
  );
  const baselineEta = shipment.createdAt ? estimateDelivery(shipment.createdAt, shipment.destinationCity?.code) : null;

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
    etaDelayReason: etaDelayReason(shipment.events, baselineEta),
    amountToCollect: shipment.collectOnDelivery && !delivered && Number.isFinite(amount) ? Math.max(0, amount) : 0,
    weightKg: weight != null && Number.isFinite(weight) && weight > 0 ? weight : null,
    deliveredAt: shipment.deliveredAt ? shipment.deliveredAt.toISOString() : null,
    receivedBy: delivered ? abbreviateName(shipment.receivedByName) || null : null,
    deliveryPhotoUrl: delivered ? shipment.deliveryPhotoUrl : null,
    currentEvent: current ? toPublicEvent(current) : null,
    events: shipment.events.map(toPublicEvent),
  };
}
