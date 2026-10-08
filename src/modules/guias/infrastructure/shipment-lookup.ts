import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { abbreviateName, evaluateLookupLimit, LOOKUP_RETENTION_DAYS, LOOKUP_WINDOW_MS, safeEqual } from "../domain/lookup";
import {
  flowProgress,
  SHIPMENT_FLOW,
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_CLIENT_TEXT,
  SHIPMENT_STATUS_LABEL,
} from "../domain/statuses";

// Consulta publica de la guia (magilus.com/guia). Lo que sale de aqui es TODO lo que ve el
// cliente: nunca transportadora, guia del proveedor, telefono, direccion ni notas internas.

export function hashIp(ip: string): string {
  const salt = process.env.SHIPMENT_LOOKUP_SALT || process.env.AUTH_SECRET || "magilus-guias";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

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
  deliveredAt: string | null;
  receivedBy: string | null;
  deliveryPhotoUrl: string | null;
  events: PublicShipmentEvent[];
};

export type LookupOutcome =
  | { ok: true; view: PublicShipmentView }
  | { ok: false; reason: "BLOCKED" | "NO_MATCH" };

export async function lookupShipment(params: { code: string; last4: string; ipHash: string }): Promise<LookupOutcome> {
  const since = new Date(Date.now() - LOOKUP_WINDOW_MS);
  const [ipFailures, codeFailures] = await Promise.all([
    prisma.shipmentLookupAttempt.count({ where: { ipHash: params.ipHash, success: false, createdAt: { gte: since } } }),
    prisma.shipmentLookupAttempt.count({ where: { code: params.code, success: false, createdAt: { gte: since } } }),
  ]);
  if (!evaluateLookupLimit({ ipFailures, codeFailures }).allowed) {
    return { ok: false, reason: "BLOCKED" };
  }

  const shipment = await prisma.shipment.findUnique({
    where: { code: params.code },
    select: {
      code: true,
      status: true,
      phoneLast4: true,
      publicEnabled: true,
      estimatedDelivery: true,
      collectOnDelivery: true,
      amountToCollect: true,
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
    },
  });

  // Siempre se compara (aunque la guia no exista) para no revelar por tiempo si existe.
  const expected = shipment?.publicEnabled ? (shipment.phoneLast4 ?? "") : "";
  const matches = safeEqual(expected || "----", params.last4) && Boolean(expected);

  await prisma.shipmentLookupAttempt.create({
    data: { ipHash: params.ipHash, code: params.code, success: Boolean(shipment && matches) },
  });
  // Limpieza al vuelo de intentos viejos (de vez en cuando, no en cada consulta).
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - LOOKUP_RETENTION_DAYS * 86_400_000);
    prisma.shipmentLookupAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => undefined);
  }

  if (!shipment || !matches) {
    return { ok: false, reason: "NO_MATCH" };
  }

  const flowIndex = SHIPMENT_FLOW.indexOf(shipment.status);
  const delivered = shipment.status === "DELIVERED";
  const amount = Number(shipment.amountToCollect);

  return {
    ok: true,
    view: {
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
            ? [formatDay(event.newEta), event.actor === "MAGILUS" ? event.note : null]
                .filter(Boolean)
                .join(" · ")
            : event.actor === "MAGILUS"
              ? event.note
              : null,
        city: event.city?.name ?? null,
      })),
    },
  };
}
