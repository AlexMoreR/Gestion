import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  buildShipmentLinkToken,
  parseShipmentLinkToken,
  verifyShipmentLinkSignature,
} from "@/lib/shipment-link-token";
import { normalizeShipmentCodeInput, resolveShipmentByCode } from "../domain/codes";
import { resolveShipmentFromLinkToken } from "../domain/link-access";
import { evaluateLookupLimit, LOOKUP_RETENTION_DAYS, LOOKUP_WINDOW_MS, safeEqual } from "../domain/lookup";
import {
  publicShipmentSelect,
  toPublicView,
  type PublicShipmentRow,
  type PublicShipmentView,
} from "../domain/public-view";
import { documentShipmentSelect, toDocumentView, type DocumentShipmentView } from "../domain/document-view";

// Consulta publica de la guia (magilus.com/guia, el enlace directo /guia/[token] y el documento
// formal /guia/[token]/documento). En "Estado del envio" lo que ve el cliente lo arma
// toPublicView (domain/public-view.ts): nunca transportadora, guia del proveedor, telefono
// completo, direccion ni notas internas. Solo el documento (lookupShipmentDocumentByLinkToken)
// agrega la direccion de entrega (domain/document-view.ts).

export type { PublicShipmentEvent, PublicShipmentView } from "../domain/public-view";
export type { DocumentShipmentView } from "../domain/document-view";

export function hashIp(ip: string): string {
  const salt = process.env.SHIPMENT_LOOKUP_SALT || process.env.AUTH_SECRET || "magilus-guias";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

// Hash de la IP de la peticion actual (mismo criterio que la consulta por formulario).
export async function currentRequestIpHash(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || list.get("x-real-ip")?.trim() || "unknown";
  return hashIp(ip);
}

export type LookupOutcome =
  | { ok: true; view: PublicShipmentView }
  | { ok: false; reason: "BLOCKED" | "NO_MATCH" };

// Acepta el codigo actual y el viejo secuencial (guardado en legacyCode tras recodificar).
function findPublicShipment(code: string) {
  return resolveShipmentByCode(code, {
    byCode: (value) => prisma.shipment.findUnique({ where: { code: value }, select: publicShipmentSelect }),
    byLegacyCode: (value) => prisma.shipment.findUnique({ where: { legacyCode: value }, select: publicShipmentSelect }),
  });
}

async function ipFailuresInWindow(ipHash: string): Promise<number> {
  const since = new Date(Date.now() - LOOKUP_WINDOW_MS);
  return prisma.shipmentLookupAttempt.count({ where: { ipHash, success: false, createdAt: { gte: since } } });
}

export async function lookupShipment(params: { code: string; last4: string; ipHash: string }): Promise<LookupOutcome> {
  const since = new Date(Date.now() - LOOKUP_WINDOW_MS);
  const [ipFailures, codeFailures] = await Promise.all([
    ipFailuresInWindow(params.ipHash),
    prisma.shipmentLookupAttempt.count({ where: { code: params.code, success: false, createdAt: { gte: since } } }),
  ]);
  if (!evaluateLookupLimit({ ipFailures, codeFailures }).allowed) {
    return { ok: false, reason: "BLOCKED" };
  }

  const shipment = await findPublicShipment(params.code);

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

  return { ok: true, view: toPublicViewWithToken(shipment) };
}

// Vista publica + token firmado para el boton "Ver guia" (documento formal). El token se arma
// con el codigo actual; nunca lleva el id interno ni el telefono.
function toPublicViewWithToken(shipment: PublicShipmentRow): PublicShipmentView {
  return toPublicView(shipment, buildShipmentLinkToken(shipment.id, shipment.code));
}

// Limite por IP + token firmado, comun al enlace directo y al documento. Si la IP ya esta
// bloqueada por fallos de la consulta, tampoco entra; cada enlace invalido cuenta como un intento
// fallido de esa IP en la misma tabla (sin columnas nuevas).
async function resolveByLinkToken<T extends { id: string; publicEnabled: boolean }>(
  params: { token: string; ipHash: string },
  findByCode: (code: string) => Promise<T | null>,
): Promise<{ ok: true; shipment: T } | { ok: false; reason: "BLOCKED" | "NO_MATCH" }> {
  const ipFailures = await ipFailuresInWindow(params.ipHash);
  if (!evaluateLookupLimit({ ipFailures, codeFailures: 0 }).allowed) {
    return { ok: false, reason: "BLOCKED" };
  }

  const shipment = await resolveShipmentFromLinkToken(params.token, {
    parse: parseShipmentLinkToken,
    normalizeCode: normalizeShipmentCodeInput,
    findByCode,
    verify: (shipmentId, signature) => verifyShipmentLinkSignature(shipmentId, signature),
  });

  if (!shipment) {
    await prisma.shipmentLookupAttempt.create({
      // Codigo fijo: cuenta para el limite por IP sin bloquear la consulta normal de esa guia.
      data: { ipHash: params.ipHash, code: "ENLACE", success: false },
    });
    return { ok: false, reason: "NO_MATCH" };
  }
  return { ok: true, shipment };
}

// Enlace directo magilus.com/guia/<codigo>.<firma> ("Estado del envio"): equivale a tener la
// guia, asi que muestra exactamente la misma vista publica que la consulta con los 4 digitos
// (toPublicView, sin direccion).
export async function lookupShipmentByLinkToken(params: { token: string; ipHash: string }): Promise<LookupOutcome> {
  const outcome = await resolveByLinkToken(params, findPublicShipment);
  return outcome.ok ? { ok: true, view: toPublicViewWithToken(outcome.shipment) } : outcome;
}

function findDocumentShipment(code: string) {
  return resolveShipmentByCode(code, {
    byCode: (value) => prisma.shipment.findUnique({ where: { code: value }, select: documentShipmentSelect }),
    byLegacyCode: (value) => prisma.shipment.findUnique({ where: { legacyCode: value }, select: documentShipmentSelect }),
  });
}

export type DocumentLookupOutcome =
  | { ok: true; view: DocumentShipmentView }
  | { ok: false; reason: "BLOCKED" | "NO_MATCH" };

// Documento formal /guia/<codigo>.<firma>/documento: mismo token y mismo limite por IP, pero con
// la vista del documento (toDocumentView: lleva la direccion de entrega). Solo la pide esa pagina.
export async function lookupShipmentDocumentByLinkToken(params: {
  token: string;
  ipHash: string;
}): Promise<DocumentLookupOutcome> {
  const outcome = await resolveByLinkToken(params, findDocumentShipment);
  return outcome.ok
    ? { ok: true, view: toDocumentView(outcome.shipment, buildShipmentLinkToken(outcome.shipment.id, outcome.shipment.code)) }
    : outcome;
}
