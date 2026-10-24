import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Enlace para subir la foto de un gasto dicho a Claude: /gastos/soporte/<id>.<aleatorio>.<firma>.
// La firma es un HMAC-SHA256 con AUTH_SECRET (mismo patron que shipment-link-token.ts) y en la BD
// solo se guarda el SHA-256 del token completo: quien lea la tabla no puede armar el enlace.

const SIGNATURE_LENGTH = 22; // 22 caracteres base64url = 132 bits

function secret(): string {
  return process.env.AUTH_SECRET ?? "";
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`gasto-soporte:${payload}`).digest("base64url").slice(0, SIGNATURE_LENGTH);
}

export function hashDraftToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Token nuevo "<aleatorio>.<firma>". null si el servidor no tiene secreto configurado.
export function buildDraftToken(key: string = secret()): { token: string; hash: string } | null {
  if (!key) {
    return null;
  }
  const random = randomBytes(24).toString("base64url");
  const token = `${random}.${sign(random, key)}`;
  return { token, hash: hashDraftToken(token) };
}

// La firma del token es la de este servidor (descarta tokens inventados sin ir a la BD).
export function verifyDraftToken(raw: string | null | undefined, key: string = secret()): string | null {
  const token = (raw ?? "").trim();
  const dot = token.lastIndexOf(".");
  if (!key || dot <= 0 || token.length > 120) {
    return null;
  }
  const random = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(random) || !new RegExp(`^[A-Za-z0-9_-]{${SIGNATURE_LENGTH}}$`).test(signature)) {
    return null;
  }
  const expected = sign(random, key);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return null;
  }
  return token;
}
