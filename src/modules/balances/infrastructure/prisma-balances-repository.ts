import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  BalancesRepository,
  CreateShippingCostInput,
  CreateSupplierPaymentInput,
  ListBalancesQuery,
  UpdateShippingCostInput,
  UpdateSupplierPaymentInput,
} from "../domain/repository";
import type {
  DashboardMetrics,
  PagedResult,
  PaymentHistoryRow,
  SaleProfit,
  ShippingCost,
  ShippingCostRow,
  SupplierBalance,
  SupplierPayment,
} from "../domain/entities";
import {
  calculateSaleProfitSummary,
  summarizeDashboardMetrics,
  summarizeSupplierBalance,
} from "../domain/calculations";

type PaymentSelection = {
  id: string;
  supplierId: string;
  amount: Prisma.Decimal;
  saleId: string | null;
  transactionReference: string | null;
  paymentDate: Date | null;
  note: string | null;
  createdAt: Date;
  supplier: { name: string };
  sale: { code: string; total: Prisma.Decimal } | null;
};

type ShippingSelection = {
  id: string;
  saleId: string;
  shippingProvider: string;
  amount: Prisma.Decimal;
  transactionReference: string;
  paymentDate: Date;
  createdAt: Date;
  sale: { code: string; client: { name: string | null } };
};

type SaleForProfitSelection = {
  id: string;
  code: string;
  total: Prisma.Decimal;
  createdAt: Date;
  client: { name: string | null };
  order: {
    items: Array<{
      quantity: number;
      purchaseCost: Prisma.Decimal | null;
    }>;
  } | null;
  shippingCosts: Array<{
    amount: Prisma.Decimal;
  }>;
};

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function normalizeSearch(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function buildPagedResult<T>(items: T[], total: number, page: number, pageSize: number): PagedResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function mapSupplierPayment(row: PaymentSelection): PaymentHistoryRow {
  return {
    id: row.id,
    supplierId: row.supplierId,
    amount: toNumber(row.amount),
    saleId: row.saleId ?? "",
    transactionReference: row.transactionReference ?? "",
    paymentDate: row.paymentDate ?? row.createdAt,
    notes: row.note,
    createdAt: row.createdAt,
    supplierName: row.supplier.name,
    saleCode: row.sale?.code ?? null,
    saleTotal: row.sale ? toNumber(row.sale.total) : null,
  };
}

function mapShippingCost(row: ShippingSelection): ShippingCostRow {
  return {
    id: row.id,
    saleId: row.saleId,
    shippingProvider: row.shippingProvider,
    amount: toNumber(row.amount),
    transactionReference: row.transactionReference,
    paymentDate: row.paymentDate,
    createdAt: row.createdAt,
    saleCode: row.sale.code,
    clientName: row.sale.client.name,
  };
}

function mapPaymentEntity(row: PaymentSelection): SupplierPayment {
  return {
    id: row.id,
    saleId: row.saleId ?? "",
    supplierId: row.supplierId,
    amount: toNumber(row.amount),
    transactionReference: row.transactionReference ?? "",
    paymentDate: row.paymentDate ?? row.createdAt,
    notes: row.note,
    createdAt: row.createdAt,
  };
}

function mapShippingEntity(row: ShippingSelection): ShippingCost {
  return {
    id: row.id,
    saleId: row.saleId,
    shippingProvider: row.shippingProvider,
    amount: toNumber(row.amount),
    transactionReference: row.transactionReference,
    paymentDate: row.paymentDate,
    createdAt: row.createdAt,
  };
}

function buildSupplierPaymentWhere(search?: string): Prisma.SupplierLedgerEntryWhereInput {
  const normalizedSearch = normalizeSearch(search);
  if (!normalizedSearch) {
    return { type: "PAYMENT" };
  }

  return {
    type: "PAYMENT",
    OR: [
      { transactionReference: { contains: normalizedSearch, mode: "insensitive" } },
      { note: { contains: normalizedSearch, mode: "insensitive" } },
      { supplier: { name: { contains: normalizedSearch, mode: "insensitive" } } },
      { sale: { code: { contains: normalizedSearch, mode: "insensitive" } } },
    ],
  };
}

function buildShippingWhere(search?: string): Prisma.ShippingCostWhereInput {
  const normalizedSearch = normalizeSearch(search);
  if (!normalizedSearch) {
    return {};
  }

  return {
    OR: [
      { shippingProvider: { contains: normalizedSearch, mode: "insensitive" } },
      { transactionReference: { contains: normalizedSearch, mode: "insensitive" } },
      { sale: { code: { contains: normalizedSearch, mode: "insensitive" } } },
      { sale: { client: { name: { contains: normalizedSearch, mode: "insensitive" } } } },
    ],
  };
}

function buildProfitWhere(search?: string): Prisma.SaleWhereInput {
  const normalizedSearch = normalizeSearch(search);
  if (!normalizedSearch) {
    return {};
  }

  return {
    OR: [
      { code: { contains: normalizedSearch, mode: "insensitive" } },
      { client: { name: { contains: normalizedSearch, mode: "insensitive" } } },
      { quote: { code: { contains: normalizedSearch, mode: "insensitive" } } },
    ],
  };
}

async function getSaleProfitRows(where?: Prisma.SaleWhereInput): Promise<SaleProfit[]> {
  const sales = await prisma.sale.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      total: true,
      createdAt: true,
      client: { select: { name: true } },
      order: {
        select: {
          items: {
            select: {
              quantity: true,
              purchaseCost: true,
            },
          },
        },
      },
      shippingCosts: {
        select: {
          amount: true,
        },
      },
    } satisfies Prisma.SaleSelect,
  });

  return sales.map((sale) =>
    calculateSaleProfitSummary({
      saleId: sale.id,
      saleCode: sale.code,
      saleAmount: toNumber(sale.total),
      createdAt: sale.createdAt,
      clientName: sale.client.name,
      orderItems: sale.order?.items.map((item) => ({
        quantity: item.quantity,
        purchaseCost: item.purchaseCost === null ? null : toNumber(item.purchaseCost),
      })) ?? [],
      shippingCosts: sale.shippingCosts.map((entry) => toNumber(entry.amount)),
    }),
  );
}

export function createPrismaBalancesRepository(): BalancesRepository {
  return {
    async listSupplierPayments(query: ListBalancesQuery): Promise<PagedResult<PaymentHistoryRow>> {
      const page = Math.max(1, query.page || 1);
      const pageSize = Math.max(1, Math.min(query.pageSize || 10, 500));
      const sortDirection = query.sortDirection === "asc" ? "asc" : "desc";
      const sortBy = query.sortBy ?? "date";
      const where = buildSupplierPaymentWhere(query.search);
      const orderBy =
        sortBy === "supplier"
          ? [{ supplier: { name: sortDirection as Prisma.SortOrder } }, { createdAt: "desc" as const }]
          : sortBy === "sale"
            ? [{ sale: { code: sortDirection as Prisma.SortOrder } }, { createdAt: "desc" as const }]
            : sortBy === "reference"
              ? [{ transactionReference: sortDirection as Prisma.SortOrder }, { createdAt: "desc" as const }]
              : sortBy === "amount"
                ? [{ amount: sortDirection as Prisma.SortOrder }, { createdAt: "desc" as const }]
                : [{ paymentDate: sortDirection as Prisma.SortOrder }, { createdAt: "desc" as const }];

      const [total, rows] = await Promise.all([
        prisma.supplierLedgerEntry.count({ where }),
        prisma.supplierLedgerEntry.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            supplierId: true,
            amount: true,
            saleId: true,
            transactionReference: true,
            paymentDate: true,
            note: true,
            createdAt: true,
            supplier: { select: { name: true } },
            sale: { select: { code: true, total: true } },
          } satisfies Prisma.SupplierLedgerEntrySelect,
        }) as unknown as PaymentSelection[],
      ]);

      return buildPagedResult(rows.map(mapSupplierPayment), total, page, pageSize);
    },

    async getSupplierPayment(paymentId: string): Promise<PaymentHistoryRow | null> {
      const row = (await prisma.supplierLedgerEntry.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          supplierId: true,
          amount: true,
          saleId: true,
          transactionReference: true,
          paymentDate: true,
          note: true,
          createdAt: true,
          supplier: { select: { name: true } },
          sale: { select: { code: true, total: true } },
        } satisfies Prisma.SupplierLedgerEntrySelect,
      })) as PaymentSelection | null;

      if (!row || row.transactionReference === null) {
        return null;
      }

      return mapSupplierPayment(row);
    },

    async createSupplierPayment(input: CreateSupplierPaymentInput): Promise<SupplierPayment> {
      const row = (await prisma.supplierLedgerEntry.create({
        data: {
          supplierId: input.supplierId,
          saleId: input.saleId,
          type: "PAYMENT",
          amount: input.amount,
          transactionReference: input.transactionReference,
          paymentDate: input.paymentDate,
          note: input.notes ?? null,
          createdById: input.createdById,
        },
        select: {
          id: true,
          supplierId: true,
          amount: true,
          saleId: true,
          transactionReference: true,
          paymentDate: true,
          note: true,
          createdAt: true,
          supplier: { select: { name: true } },
          sale: { select: { code: true, total: true } },
        } satisfies Prisma.SupplierLedgerEntrySelect,
      })) as PaymentSelection;

      return mapPaymentEntity(row);
    },

    async updateSupplierPayment(paymentId: string, input: UpdateSupplierPaymentInput): Promise<SupplierPayment> {
      const row = (await prisma.supplierLedgerEntry.update({
        where: { id: paymentId },
        data: {
          supplierId: input.supplierId,
          saleId: input.saleId,
          amount: input.amount,
          transactionReference: input.transactionReference,
          paymentDate: input.paymentDate,
          note: input.notes ?? null,
        },
        select: {
          id: true,
          supplierId: true,
          amount: true,
          saleId: true,
          transactionReference: true,
          paymentDate: true,
          note: true,
          createdAt: true,
          supplier: { select: { name: true } },
          sale: { select: { code: true, total: true } },
        } satisfies Prisma.SupplierLedgerEntrySelect,
      })) as PaymentSelection;

      return mapPaymentEntity(row);
    },

    async deleteSupplierPayment(paymentId: string): Promise<void> {
      await prisma.supplierLedgerEntry.delete({ where: { id: paymentId } });
    },

    async listShippingCosts(query: ListBalancesQuery): Promise<PagedResult<ShippingCostRow>> {
      const page = Math.max(1, query.page || 1);
      const pageSize = Math.max(1, Math.min(query.pageSize || 10, 500));
      const sortDirection = query.sortDirection === "asc" ? "asc" : "desc";
      const sortBy = query.sortBy ?? "date";
      const where = buildShippingWhere(query.search);
      const orderBy =
        sortBy === "supplier"
          ? [{ shippingProvider: sortDirection as Prisma.SortOrder }, { createdAt: "desc" as const }]
          : sortBy === "sale"
            ? [{ sale: { code: sortDirection as Prisma.SortOrder } }, { createdAt: "desc" as const }]
            : sortBy === "reference"
              ? [{ transactionReference: sortDirection as Prisma.SortOrder }, { createdAt: "desc" as const }]
              : sortBy === "amount"
                ? [{ amount: sortDirection as Prisma.SortOrder }, { createdAt: "desc" as const }]
                : [{ paymentDate: sortDirection as Prisma.SortOrder }, { createdAt: "desc" as const }];

      const [total, rows] = await Promise.all([
        prisma.shippingCost.count({ where }),
        prisma.shippingCost.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            saleId: true,
            shippingProvider: true,
            amount: true,
            transactionReference: true,
            paymentDate: true,
            createdAt: true,
            sale: {
              select: {
                code: true,
                client: { select: { name: true } },
              },
            },
          } satisfies Prisma.ShippingCostSelect,
        }) as unknown as ShippingSelection[],
      ]);

      return buildPagedResult(rows.map(mapShippingCost), total, page, pageSize);
    },

    async getShippingCost(costId: string): Promise<ShippingCost | null> {
      const row = (await prisma.shippingCost.findUnique({
        where: { id: costId },
        select: {
          id: true,
          saleId: true,
          shippingProvider: true,
          amount: true,
          transactionReference: true,
          paymentDate: true,
          createdAt: true,
        } satisfies Prisma.ShippingCostSelect,
      })) as ShippingSelection | null;

      return row ? mapShippingEntity(row) : null;
    },

    async createShippingCost(input: CreateShippingCostInput): Promise<ShippingCost> {
      const row = await prisma.shippingCost.create({
        data: {
          saleId: input.saleId,
          shippingProvider: input.shippingProvider,
          amount: input.amount,
          transactionReference: input.transactionReference,
          paymentDate: input.paymentDate,
          createdById: input.createdById,
        },
        select: {
          id: true,
          saleId: true,
          shippingProvider: true,
          amount: true,
          transactionReference: true,
          paymentDate: true,
          createdAt: true,
        } satisfies Prisma.ShippingCostSelect,
      });

      return mapShippingEntity(row as ShippingSelection);
    },

    async updateShippingCost(costId: string, input: UpdateShippingCostInput): Promise<ShippingCost> {
      const row = await prisma.shippingCost.update({
        where: { id: costId },
        data: {
          saleId: input.saleId,
          shippingProvider: input.shippingProvider,
          amount: input.amount,
          transactionReference: input.transactionReference,
          paymentDate: input.paymentDate,
        },
        select: {
          id: true,
          saleId: true,
          shippingProvider: true,
          amount: true,
          transactionReference: true,
          paymentDate: true,
          createdAt: true,
        } satisfies Prisma.ShippingCostSelect,
      });

      return mapShippingEntity(row as ShippingSelection);
    },

    async deleteShippingCost(costId: string): Promise<void> {
      await prisma.shippingCost.delete({ where: { id: costId } });
    },

    async calculateSaleProfit(saleId: string): Promise<SaleProfit | null> {
      const rows = await getSaleProfitRows({ id: saleId });
      return rows[0] ?? null;
    },

    async listProfitReport(query: ListBalancesQuery): Promise<PagedResult<SaleProfit>> {
      const page = Math.max(1, query.page || 1);
      const pageSize = Math.max(1, Math.min(query.pageSize || 10, 500));
      const where = buildProfitWhere(query.search);
      const [total, rows] = await Promise.all([
        prisma.sale.count({ where }),
        getSaleProfitRows(where),
      ]);

      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize);
      return buildPagedResult(items, total, page, pageSize);
    },

    async listSupplierBalances(): Promise<SupplierBalance[]> {
      const suppliers = await prisma.supplier.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          ledgerEntries: {
            where: { type: "PAYMENT" },
            orderBy: { createdAt: "desc" },
            select: {
              amount: true,
              createdAt: true,
              sale: { select: { code: true } },
            },
          },
        } satisfies Prisma.SupplierSelect,
      });

      return suppliers.map((supplier) =>
        summarizeSupplierBalance(
          supplier.id,
          supplier.name,
          supplier.ledgerEntries.map((entry) => ({
            amount: toNumber(entry.amount),
            createdAt: entry.createdAt,
            saleCode: entry.sale?.code ?? null,
          })),
        ),
      );
    },

    async getDashboardMetrics(): Promise<DashboardMetrics> {
      const sales = await getSaleProfitRows();
      return summarizeDashboardMetrics(sales);
    },
  };
}
