import { createHmac, timingSafeEqual } from "node:crypto";

// Enlace directo de la guia para el cliente: magilus.com/guia/<codigo>.<firma>.
// La firma es un HMAC-SHA256 del id interno de la guia con AUTH_SECRET (mismo secreto que los
// otros enlaces firmados del repo). No se guarda nada en la BD: el token se deriva siempre igual.
// El codigo va delante solo para encontrar la guia; sin el secreto no se puede fabricar la firma,
// y no lleva el telefono. Si la guia se recodifica, el enlace viejo sigue sirviendo (la firma es
// del id y el codigo viejo se resuelve por legacyCode).

const SIGNATURE_LENGTH = 22; // 22 caracteres base64url = 132 bits

function secret(): string {
  return process.env.AUTH_SECRET ?? "";
}

export function shipmentLinkSignature(shipmentId: string, key: string = secret()): string | null {
  if (!key || !shipmentId) {
    return null;
  }
  return createHmac("sha256", key).update(`guia-enlace:${shipmentId}`).digest("base64url").slice(0, SIGNATURE_LENGTH);
}

// Token publico "<codigo>.<firma>". null si el servidor no tiene secreto configurado.
export function buildShipmentLinkToken(shipmentId: string, code: string, key: string = secret()): string | null {
  const signature = shipmentLinkSignature(shipmentId, key);
  return signature ? `${code}.${signature}` : null;
}

// Separa el token en codigo y firma. null si no tiene la forma esperada.
export function parseShipmentLinkToken(raw: string | null | undefined): { code: string; signature: string } | null {
  const token = (raw ?? "").trim();
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || token.length > 120) {
    return null;
  }
  const code = token.slice(0, dot).toUpperCase();
  const signature = token.slice(dot + 1);
  if (!/^[A-Z0-9-]{3,40}$/.test(code) || !new RegExp(`^[A-Za-z0-9_-]{${SIGNATURE_LENGTH}}$`).test(signature)) {
    return null;
  }
  return { code, signature };
}

// Compara en tiempo constante la firma recibida con la de esta guia.
export function verifyShipmentLinkSignature(shipmentId: string, signature: string, key: string = secret()): boolean {
  const expected = shipmentLinkSignature(shipmentId, key);
  if (!expected || signature.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
