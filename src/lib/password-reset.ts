import { createHmac, timingSafeEqual } from "node:crypto";

type PasswordResetPayload = {
  userId: string;
  email: string;
  purpose: "reset";
  exp: number;
};

const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1 hora

function getSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET no configurado");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createPasswordResetToken(userId: string, email: string): string {
  const payload: PasswordResetPayload = {
    userId,
    email,
    purpose: "reset",
    exp: Math.floor(Date.now() / 1000) + PASSWORD_RESET_TTL_SECONDS,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyPasswordResetToken(token: string): PasswordResetPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedBuffer = Buffer.from(sign(encodedPayload));
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    const raw = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(raw) as Partial<PasswordResetPayload>;
    if (!payload.userId || !payload.email || payload.purpose !== "reset" || !payload.exp) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { userId: payload.userId, email: payload.email, purpose: "reset", exp: payload.exp };
  } catch {
    return null;
  }
}
