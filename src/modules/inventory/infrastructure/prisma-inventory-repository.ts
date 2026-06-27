import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CreateInventoryMovementInput, InventoryRepository } from "../domain/repository";
import type {
  InventoryMetrics,
  InventoryMovementRow,
  InventoryMovementType,
  ProductStock,
} from "../domain/entities";
import { computeStockStatus, summarizeInventoryMetrics } from "../domain/calculations";

// Cualquier producto puede tener existencias (el modo "por stock / por orden" se
// decide en la venta, no en el producto). Solo se excluyen los combos, que no
// manejan inventario propio (su stock depende de los componentes).
const TRACKABLE_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  isBundle: false,
};

const STATUS_PRIORITY: Record<ProductStock["status"], number> = {
  OUT: 0,
  LOW: 1,
  OK: 2,
};

export function createPrismaInventoryRepository(): InventoryRepository {
  return {
    async listProductStocks(): Promise<ProductStock[]> {
      const [products, movements] = await Promise.all([
        prisma.product.findMany({
          where: TRACKABLE_PRODUCT_WHERE,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            code: true,
            minStock: true,
            price: true,
            baseCost: true,
            thumbnailUrl: true,
            category: { select: { name: true } },
          },
        }),
        prisma.inventoryMovement.groupBy({
          by: ["productId"],
          _sum: { change: true },
          _max: { movementDate: true },
        }),
      ]);

      const stockMap = new Map<string, { stock: number; lastMovementAt: Date | null }>();
      for (const row of movements) {
        stockMap.set(row.productId, {
          stock: row._sum.change ?? 0,
          lastMovementAt: row._max.movementDate ?? null,
        });
      }

      const result = products.map((product) => {
        const totals = stockMap.get(product.id);
        const stock = totals?.stock ?? 0;
        return {
          productId: product.id,
          name: product.name,
          code: product.code,
          categoryName: product.category?.name ?? null,
          price: Number(product.price),
          baseCost: Number(product.baseCost),
          thumbnailUrl: product.thumbnailUrl,
          minStock: product.minStock,
          stock,
          status: computeStockStatus(stock, product.minStock),
          lastMovementAt: totals?.lastMovementAt ?? null,
        } satisfies ProductStock;
      });

      // Resalta primero lo critico (agotado y bajo stock), luego por nombre.
      return result.sort((a, b) => {
        const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name);
      });
    },

    async getCurrentStock(productId: string): Promise<number> {
      const aggregate = await prisma.inventoryMovement.aggregate({
        where: { productId },
        _sum: { change: true },
      });
      return aggregate._sum.change ?? 0;
    },

    async listMovements(): Promise<InventoryMovementRow[]> {
      const rows = await prisma.inventoryMovement.findMany({
        orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
        take: 500,
        select: {
          id: true,
          productId: true,
          type: true,
          change: true,
          note: true,
          purchaseCode: true,
          movementDate: true,
          createdAt: true,
          product: { select: { name: true, code: true } },
        },
      });

      // Mapa código de compra (COM-) -> código de orden (ORD-) para mostrar ambos.
      const purchaseCodes = Array.from(
        new Set(rows.map((row) => row.purchaseCode).filter((code): code is string => Boolean(code))),
      );
      const orders = purchaseCodes.length
        ? await prisma.order.findMany({
            where: { purchaseCode: { in: purchaseCodes } },
            select: { code: true, purchaseCode: true },
          })
        : [];
      const orderCodeByPurchase = new Map(
        orders.map((order) => [order.purchaseCode, order.code] as const),
      );

      return rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        type: row.type as InventoryMovementType,
        change: row.change,
        note: row.note,
        purchaseCode: row.purchaseCode,
        movementDate: row.movementDate,
        createdAt: row.createdAt,
        productName: row.product.name,
        productCode: row.product.code,
        // Compras: ORD- desde el código de compra. Salidas por venta: ORD- desde la nota.
        orderCode: row.purchaseCode
          ? orderCodeByPurchase.get(row.purchaseCode) ?? null
          : row.note?.match(/ORD-\d+/)?.[0] ?? null,
      }));
    },

    async createMovement(input: CreateInventoryMovementInput): Promise<string> {
      const created = await prisma.inventoryMovement.create({
        data: {
          productId: input.productId,
          type: input.type,
          change: input.change,
          note: input.note ?? null,
          movementDate: input.movementDate,
          createdById: input.createdById,
        },
        select: { id: true },
      });
      return created.id;
    },

    async updateMinStock(productId: string, minStock: number): Promise<void> {
      await prisma.product.update({
        where: { id: productId },
        data: { minStock },
      });
    },

    async getMetrics(): Promise<InventoryMetrics> {
      const stocks = await this.listProductStocks();
      return summarizeInventoryMetrics(stocks);
    },

    async isTrackableProduct(productId: string): Promise<boolean> {
      const product = await prisma.product.findFirst({
        where: { id: productId, ...TRACKABLE_PRODUCT_WHERE },
        select: { id: true },
      });
      return Boolean(product);
    },
  };
}
