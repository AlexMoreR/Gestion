import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { DateRange } from "@/modules/balances/domain/entities";
import type { PortalQuoteInput } from "../domain/seller-portal";

// Tokens del link privado de cada asesora: AppSetting "sellerCommissionLinks" = { userId: token }.
// Cambiar el token invalida el link anterior.
const LINKS_SETTING_KEY = "sellerCommissionLinks";

async function readLinks(): Promise<Record<string, string>> {
  const row = await prisma.appSetting.findUnique({ where: { key: LINKS_SETTING_KEY }, select: { value: true } });
  if (!row?.value) return {};
  try {
    const data = JSON.parse(row.value) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length >= 20,
      ),
    );
  } catch {
    return {};
  }
}

export async function listSellerLinks(): Promise<Record<string, string>> {
  return readLinks();
}

export async function regenerateSellerLink(userId: string): Promise<string> {
  const links = await readLinks();
  const token = randomBytes(18).toString("base64url");
  links[userId] = token;
  const value = JSON.stringify(links);
  await prisma.appSetting.upsert({
    where: { key: LINKS_SETTING_KEY },
    create: { key: LINKS_SETTING_KEY, value },
    update: { value },
  });
  return token;
}

export async function findSellerByToken(token: string): Promise<{ id: string; name: string } | null> {
  if (!token || token.length < 20) return null;
  const links = await readLinks();
  const userId = Object.entries(links).find(([, value]) => value === token)?.[0];
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } });
  if (!user || user.role === "CLIENTE") return null;
  return { id: user.id, name: user.name?.trim() || user.email };
}

// Cotizaciones abiertas de la asesora creadas en el mes (sin venta, no rechazadas ni vencidas),
// con un costo estimado de catalogo para calcular lo que ganaria si la cierra.
export async function listOpenQuotesBySeller(sellerId: string, period: DateRange): Promise<PortalQuoteInput[]> {
  const quotes = await prisma.quote.findMany({
    where: {
      createdById: sellerId,
      createdAt: { gte: period.from, lt: period.to },
      status: { in: ["DRAFT", "SENT", "ACCEPTED"] },
      sale: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      code: true,
      createdAt: true,
      status: true,
      total: true,
      client: { select: { name: true } },
      items: {
        select: {
          quantity: true,
          product: { select: { name: true, baseCost: true, additionalCost: true } },
        },
      },
    },
  });
  return quotes.map((quote) => ({
    quoteCode: quote.code,
    createdAt: quote.createdAt,
    clientName: quote.client?.name ?? null,
    status: quote.status,
    total: Number(quote.total),
    estimatedCost: quote.items.reduce(
      (sum, item) => sum + (Number(item.product.baseCost) + Number(item.product.additionalCost)) * item.quantity,
      0,
    ),
    products: quote.items.map((item) => (item.quantity > 1 ? `${item.product.name} x${item.quantity}` : item.product.name)),
  }));
}
