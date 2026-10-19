import { Prisma, type PrismaClient } from "@prisma/client";

import { logActivityAs } from "@/lib/activity-log";
import { createQuoteWithNextCode, upsertQuoteClient } from "@/lib/quote-creation";

import type { CrmQuoteRepository, StaffUser } from "../application/create-crm-quote";

const STAFF_SELECT = { id: true, name: true, email: true } as const;

export function createPrismaCrmQuoteRepository(db: PrismaClient): CrmQuoteRepository {
  return {
    async findProducts({ ids, codes }) {
      if (ids.length === 0 && codes.length === 0) return [];
      const products = await db.product.findMany({
        where: {
          OR: [
            ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
            ...codes.map((code) => ({ code: { equals: code.trim(), mode: "insensitive" as const } })),
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
          price: true,
          isBundle: true,
          bundleComponents: {
            orderBy: { sortOrder: "asc" },
            select: {
              childId: true,
              quantity: true,
              child: { select: { name: true, code: true, price: true } },
            },
          },
        },
        take: 200,
      });
      return products.map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        price: Number(product.price),
        isBundle: product.isBundle,
        components: product.bundleComponents.map((component) => ({
          productId: component.childId,
          name: component.child.name,
          code: component.child.code,
          quantity: component.quantity,
          retailPrice: Number(component.child.price),
        })),
      }));
    },

    async findRecentByConversation(crmConversationId, since) {
      const quotes = await db.quote.findMany({
        where: {
          createdAt: { gte: since },
          originDetail: { path: ["crmConversationId"], equals: crmConversationId },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          total: true,
          shareToken: true,
          originDetail: true,
          createdBy: { select: { email: true, name: true } },
        },
        take: 10,
      });
      return quotes.map((quote) => {
        const detail = quote.originDetail as Record<string, unknown> | null;
        return {
          id: quote.id,
          code: quote.code,
          total: Number(quote.total),
          shareToken: quote.shareToken,
          itemsKey: typeof detail?.crmItemsKey === "string" ? detail.crmItemsKey : null,
          createdBy: quote.createdBy,
        };
      });
    },

    async findStaffByEmail(email): Promise<StaffUser | null> {
      return db.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, role: { in: ["ADMIN", "EMPLEADO"] } },
        select: STAFF_SELECT,
      });
    },

    async findFirstAdmin(): Promise<StaffUser | null> {
      return db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: STAFF_SELECT });
    },

    async upsertClient(client) {
      // Si el correo es de alguien del equipo (ADMIN/EMPLEADO) no se usa para buscar: la regla del
      // admin lo convertiria en CLIENTE. Se sigue por documento/telefono.
      let email = client.email;
      if (email) {
        const owner = await db.user.findUnique({ where: { email }, select: { role: true } });
        if (owner && owner.role !== "CLIENTE") email = null;
      }
      return upsertQuoteClient(db, { ...client, email });
    },

    async hasPreviousSales(clientId) {
      const count = await db.sale.count({ where: { clientId, status: { not: "CANCELLED" } } });
      return count > 0;
    },

    async createQuote(input) {
      return createQuoteWithNextCode(db, {
        clientId: input.clientId,
        createdById: input.createdById,
        status: "DRAFT",
        notes: input.notes,
        validUntil: null,
        subtotal: new Prisma.Decimal(input.subtotal),
        total: new Prisma.Decimal(input.total),
        origin: input.origin,
        originDetail: input.originDetail as Prisma.InputJsonValue,
        items: {
          create: input.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: new Prisma.Decimal(line.unitPrice),
            fulfillmentMode: "STOCK" as const,
            lineTotal: new Prisma.Decimal(line.lineTotal),
            notes: line.notes,
          })),
        },
      });
    },

    async logCreated(actor, quote) {
      await logActivityAs(actor, {
        action: "CREATE",
        entityType: "QUOTE",
        entityId: quote.id,
        summary: `Creó la cotización ${quote.code} desde el CRM`,
      });
    },
  };
}
