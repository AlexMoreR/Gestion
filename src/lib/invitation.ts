import { createHmac, timingSafeEqual } from "node:crypto";

type InvitationPayload = {
  userId: string;
  email: string;
  purpose: "invite";
  exp: number;
};

const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

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

export function createInvitationToken(userId: string, email: string): string {
  const payload: InvitationPayload = {
    userId,
    email,
    purpose: "invite",
    exp: Math.floor(Date.now() / 1000) + INVITATION_TTL_SECONDS,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyInvitationToken(token: string): InvitationPayload | null {
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
    const payload = JSON.parse(raw) as Partial<InvitationPayload>;
    if (!payload.userId || !payload.email || payload.purpose !== "invite" || !payload.exp) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { userId: payload.userId, email: payload.email, purpose: "invite", exp: payload.exp };
  } catch {
    return null;
  }
}
