import { Prisma, type PrismaClient } from "@prisma/client";

import type { QuoteForOrigin, SaleOriginRepository } from "../application/register-sale-origin";
import { CONSUMIDOR_FINAL_EMAIL, phoneMatchKey } from "../domain/sale-origin";

// Adaptador Prisma del origen de ventas. Recibe el cliente de Prisma (en vez de importar
// "@/lib/prisma") para que el script de relleno lo pueda usar con su propia conexion.
export function createPrismaSaleOriginRepository(db: PrismaClient): SaleOriginRepository {
  return {
    async findQuoteByCodes(codes: string[]): Promise<QuoteForOrigin | null> {
      if (codes.length === 0) return null;
      const quotes = await db.quote.findMany({
        where: { code: { in: codes } },
        select: {
          id: true,
          code: true,
          createdAt: true,
          client: { select: { id: true, email: true } },
          sale: { select: { id: true, createdAt: true } },
        },
      });
      // Si existieran "COT-00121" y "COT-121", gana el canonico (primero en la lista).
      const quote = codes.map((code) => quotes.find((row) => row.code === code)).find(Boolean);
      if (!quote) return null;
      return {
        id: quote.id,
        code: quote.code,
        createdAt: quote.createdAt,
        client: { id: quote.client.id, isGeneric: quote.client.email === CONSUMIDOR_FINAL_EMAIL },
        sale: quote.sale,
      };
    },

    async findClientIdsByPhone(phoneKey: string): Promise<string[]> {
      // Prefiltro en la base con los ultimos 7 digitos (los telefonos se guardan con formatos
      // distintos: "+57 300...", "300 ...", "57300..."); la comparacion exacta se hace en JS.
      const users = await db.user.findMany({
        where: {
          role: "CLIENTE",
          email: { not: CONSUMIDOR_FINAL_EMAIL },
          phone: { contains: phoneKey.slice(-7) },
        },
        select: { id: true, phone: true },
        take: 50,
      });
      return users.filter((user) => phoneMatchKey(user.phone) === phoneKey).map((user) => user.id);
    },

    async hasPreviousSales({ clientIds, before, excludeSaleId }): Promise<boolean> {
      if (clientIds.length === 0) return false;
      // Una venta cancelada no es una compra: no hace recurrente al cliente.
      const count = await db.sale.count({
        where: {
          clientId: { in: clientIds },
          createdAt: { lt: before },
          status: { not: "CANCELLED" },
          ...(excludeSaleId ? { id: { not: excludeSaleId } } : {}),
        },
      });
      return count > 0;
    },

    async saveOrigin({ quoteId, origin, originDetail }): Promise<{ saleUpdated: boolean }> {
      const detail = originDetail ? (originDetail as Prisma.InputJsonValue) : Prisma.DbNull;
      const [, saleResult] = await db.$transaction([
        db.quote.update({ where: { id: quoteId }, data: { origin, originDetail: detail } }),
        db.sale.updateMany({ where: { quoteId }, data: { origin, originDetail: detail } }),
      ]);
      return { saleUpdated: saleResult.count > 0 };
    },
  };
}
