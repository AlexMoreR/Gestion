import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, Role, type PrismaClient } from "@prisma/client";

// Reglas compartidas para crear cotizaciones: las usa el admin (quote-actions.ts) y la API del CRM
// (POST /api/cotizaciones). Viven aqui para que las dos rutas creen el cliente y el codigo igual.

export type QuoteClientData = {
  name: string;
  document?: string | null;
  email?: string | null;
  phone: string;
  address: string;
  neighborhood?: string | null;
  department?: string | null;
  city: string;
};

export function buildQuoteCode(index: number): string {
  return `COT-${String(index).padStart(5, "0")}`;
}

export function parseQuoteCodeNumber(code: string): number {
  const match = /^COT-(\d+)$/.exec(code.trim());
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Reutiliza un cliente existente para no duplicarlo: primero por correo (clave unica), luego por
// documento (identidad fuerte) y, si no hay documento, por telefono. Si no existe, lo crea con una
// clave aleatoria (el cliente no entra con ella) y, sin correo, uno tecnico "@sin-correo.local".
export async function upsertQuoteClient(db: PrismaClient, data: QuoteClientData): Promise<string> {
  const clientProfileData = {
    name: data.name,
    document: data.document ?? null,
    phone: data.phone,
    address: data.address,
    neighborhood: data.neighborhood ?? null,
    department: data.department ?? null,
    city: data.city,
  };

  let existing = data.email ? await db.user.findUnique({ where: { email: data.email } }) : null;

  if (!existing && data.document) {
    existing = await db.user.findFirst({ where: { role: "CLIENTE", document: data.document } });
  }

  if (!existing && !data.document && data.phone) {
    existing = await db.user.findFirst({ where: { role: "CLIENTE", phone: data.phone } });
  }

  if (existing) {
    const updated = await db.user.update({
      where: { id: existing.id },
      data: { role: "CLIENTE", ...clientProfileData },
      select: { id: true },
    });
    return updated.id;
  }

  const password = randomUUID().replace(/-/g, "").slice(0, 14);
  const hashedPassword = await bcrypt.hash(password, 12);
  const email = data.email ?? `cliente-${randomUUID().replace(/-/g, "").slice(0, 16)}@sin-correo.local`;
  const created = await db.user.create({
    data: { ...clientProfileData, email, role: Role.CLIENTE, password: hashedPassword },
    select: { id: true },
  });
  return created.id;
}

export type NewQuoteData = Omit<Prisma.QuoteUncheckedCreateInput, "code" | "shareToken">;

// Crea la cotizacion con el siguiente codigo COT-xxxxx (reintenta si otro lo tomo al mismo tiempo)
// y un shareToken nuevo para el enlace publico /cotizaciones/<shareToken>.
export async function createQuoteWithNextCode(
  db: PrismaClient,
  data: NewQuoteData,
): Promise<{ id: string; code: string; shareToken: string }> {
  return db.$transaction(async (tx) => {
    const lastQuote = await tx.quote.findFirst({ select: { code: true }, orderBy: { code: "desc" } });
    const baseCodeNumber = lastQuote ? parseQuoteCodeNumber(lastQuote.code) : 0;
    const maxCodeAttempts = 30;

    for (let offset = 0; offset < maxCodeAttempts; offset += 1) {
      const code = buildQuoteCode(baseCodeNumber + 1 + offset);
      const shareToken = randomUUID().replace(/-/g, "");
      try {
        return await tx.quote.create({
          data: { ...data, code, shareToken },
          select: { id: true, code: true, shareToken: true },
        });
      } catch (error) {
        if (isUniqueError(error) && offset < maxCodeAttempts - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("No se pudo asignar codigo a la cotizacion");
  });
}
