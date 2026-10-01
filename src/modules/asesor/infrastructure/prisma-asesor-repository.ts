import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { groupQuoteDisplayItems } from "@/lib/quote-display-items";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import type { DayRange, ProductRow, QuoteRow, QuoteStatusCode, SaleDetail, Seller } from "../domain/entities";
import type { AsesorReadRepository } from "../domain/repository";

// Adaptador Prisma de SOLO LECTURA: unicamente findMany (ningun create/update/delete).

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toSeller(user: { id: string; name: string | null; email: string } | null | undefined): Seller | null {
  if (!user) return null;
  return { id: user.id, name: user.name?.trim() || user.email };
}

const userSelect = { id: true, name: true, email: true } as const;

export function createPrismaAsesorRepository(): AsesorReadRepository {
  return {
    async getSaleDetails(saleIds: string[]): Promise<SaleDetail[]> {
      if (saleIds.length === 0) return [];

      const sales = await prisma.sale.findMany({
        where: { id: { in: saleIds } },
        select: {
          id: true,
          code: true,
          createdAt: true,
          client: { select: { name: true } },
          createdBy: { select: userSelect },
          quote: { select: { code: true, createdBy: { select: userSelect } } },
          order: {
            select: {
              code: true,
              items: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  quantity: true,
                  unitPrice: true,
                  lineTotal: true,
                  notes: true,
                  product: { select: { name: true, code: true, thumbnailUrl: true, description: true } },
                },
              },
            },
          },
        },
      });

      return sales.map((sale) => ({
        saleId: sale.id,
        saleCode: sale.code,
        quoteCode: sale.quote?.code ?? null,
        orderCode: sale.order?.code ?? null,
        saleDate: sale.createdAt,
        clientName: sale.client?.name ?? null,
        seller: toSeller(sale.quote?.createdBy),
        registeredBy: toSeller(sale.createdBy),
        // Los combos se muestran como un solo producto (igual que en la factura).
        products: groupQuoteDisplayItems(
          (sale.order?.items ?? []).map((item) => ({
            id: item.id,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            product: item.product,
            meta: parseQuoteItemMeta(item.notes),
          })),
        ).map((line) => ({ nombre: line.productName, codigo: line.productCode, cantidad: line.quantity })),
      }));
    },

    async listQuotes(range: DayRange, statuses: readonly QuoteStatusCode[] | null): Promise<QuoteRow[]> {
      const quotes = await prisma.quote.findMany({
        where: {
          createdAt: { gte: range.from, lt: range.to },
          ...(statuses ? { status: { in: [...statuses] } } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: {
          code: true,
          createdAt: true,
          status: true,
          total: true,
          client: { select: { name: true } },
          createdBy: { select: userSelect },
          sale: { select: { code: true } },
        },
      });

      return quotes.map((quote) => ({
        quoteCode: quote.code,
        createdAt: quote.createdAt,
        status: quote.status,
        total: toNumber(quote.total),
        clientName: quote.client?.name ?? null,
        seller: toSeller(quote.createdBy),
        saleCode: quote.sale?.code ?? null,
      }));
    },

    async listProducts(search?: string): Promise<ProductRow[]> {
      const term = search?.trim();
      const products = await prisma.product.findMany({
        where: term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { code: { contains: term, mode: "insensitive" } },
                { category: { is: { name: { contains: term, mode: "insensitive" } } } },
              ],
            }
          : undefined,
        orderBy: { name: "asc" },
        select: {
          code: true,
          name: true,
          price: true,
          baseCost: true,
          additionalCost: true,
          isBundle: true,
          hiddenFromStore: true,
          category: { select: { name: true } },
        },
      });

      return products.map((product) => ({
        code: product.code,
        name: product.name,
        categoryName: product.category?.name ?? null,
        price: toNumber(product.price),
        baseCost: toNumber(product.baseCost),
        additionalCost: toNumber(product.additionalCost),
        isBundle: product.isBundle,
        hiddenFromStore: product.hiddenFromStore,
      }));
    },
  };
}
