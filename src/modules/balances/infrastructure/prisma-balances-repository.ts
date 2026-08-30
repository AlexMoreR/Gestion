import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  BalancesRepository,
  CreateAccountInput,
  CreateAccountMovementInput,
  CreateShippingCostInput,
  CreateSupplierPaymentInput,
  ListBalancesQuery,
  UpdateAccountInput,
  UpdateShippingCostInput,
  UpdateSupplierPaymentInput,
} from "../domain/repository";
import type {
  Account,
  AccountBalance,
  AccountTransaction,
  AccountType,
  DashboardMetrics,
  DateRange,
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
  summarizeAccountBalance,
  summarizeDashboardMetrics,
  summarizeSupplierBalance,
} from "../domain/calculations";

type AccountSelection = {
  id: string;
  name: string;
  type: AccountType;
  reference: string | null;
  isActive: boolean;
  openingBalance: Prisma.Decimal;
  createdAt: Date;
};

function mapAccount(row: AccountSelection): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    reference: row.reference,
    isActive: row.isActive,
    openingBalance: toNumber(row.openingBalance),
    createdAt: row.createdAt,
  };
}

type PaymentSelection = {
  id: string;
  supplierId: string;
  amount: Prisma.Decimal;
  saleId: string | null;
  transactionReference: string | null;
  paymentDate: Date | null;
  note: string | null;
  accountId?: string | null;
  receiptUrl?: string | null;
  receiptName?: string | null;
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
  accountId?: string | null;
  createdAt: Date;
  sale: { code: string; client: { name: string | null } };
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
    accountId: row.accountId ?? null,
    receiptUrl: row.receiptUrl ?? null,
    receiptName: row.receiptName ?? null,
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
    accountId: row.accountId ?? null,
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
    receiptUrl: row.receiptUrl ?? null,
    receiptName: row.receiptName ?? null,
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
  // Solo ventas facturadas con su orden entregada (COMPLETED). El filtro por mes
  // NO se hace aqui: se aplica luego en JS con la fecha de entrega real (la ultima
  // linea "Cerrada" del historial), para no depender de un campo que los ciclos
  // de "deshacer / re-entregar" pueden dejar desajustado o nulo.
  const base: Prisma.SaleWhereInput = {
    status: "INVOICED",
    order: { is: { status: "COMPLETED" } },
  };
  const normalizedSearch = normalizeSearch(search);
  if (!normalizedSearch) {
    return base;
  }

  return {
    ...base,
    OR: [
      { code: { contains: normalizedSearch, mode: "insensitive" } },
      { client: { name: { contains: normalizedSearch, mode: "insensitive" } } },
      { quote: { code: { contains: normalizedSearch, mode: "insensitive" } } },
    ],
  };
}

// Fecha de reconocimiento = mes de ENTREGA (SaleProfit.createdAt ya viene con la
// fecha de la ultima linea "Cerrada"). Se filtra en JS para tomar SIEMPRE la
// ultima entrega y evitar doble conteo si una orden se entrego en meses distintos.
function filterByDeliveryPeriod(rows: SaleProfit[], period?: DateRange): SaleProfit[] {
  if (!period) {
    return rows;
  }
  return rows.filter((row) => row.createdAt >= period.from && row.createdAt < period.to);
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
          completedAt: true,
          // Fecha de la ultima entrega (paso a "Cerrada"), editable desde el
          // historial; es la que decide el mes de la venta.
          history: {
            where: { toStatus: "COMPLETED" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
          items: {
            select: {
              quantity: true,
              purchaseCost: true,
              fulfillmentMode: true,
              // Para stock, el costo real de inventario = base + envio/flete.
              product: { select: { baseCost: true, additionalCost: true } },
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
      // Reconocimiento por fecha de entrega: ultima linea "Cerrada" del historial;
      // si faltara, completedAt y por ultimo la fecha de creacion.
      createdAt: sale.order?.history[0]?.createdAt ?? sale.order?.completedAt ?? sale.createdAt,
      clientName: sale.client.name,
      orderItems: sale.order?.items.map((item) => ({
        quantity: item.quantity,
        purchaseCost: item.purchaseCost === null ? null : toNumber(item.purchaseCost),
        fulfillmentMode: item.fulfillmentMode,
        baseCost: toNumber(item.product.baseCost),
        additionalCost: toNumber(item.product.additionalCost),
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
            accountId: true,
            createdAt: true,
            receiptUrl: true,
            receiptName: true,
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
          receiptUrl: true,
          receiptName: true,
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
          accountId: input.accountId ?? null,
          receiptUrl: input.receiptUrl ?? null,
          receiptName: input.receiptName ?? null,
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
          receiptUrl: true,
          receiptName: true,
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
          accountId: input.accountId ?? null,
          ...(input.receiptUrl !== undefined
            ? { receiptUrl: input.receiptUrl, receiptName: input.receiptName ?? null }
            : {}),
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
          receiptUrl: true,
          receiptName: true,
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
            accountId: true,
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
          accountId: input.accountId ?? null,
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
          accountId: input.accountId ?? null,
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
      const allRows = await getSaleProfitRows(where);
      const rows = filterByDeliveryPeriod(allRows, query.period);

      const total = rows.length;
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

    async getDashboardMetrics(period?: DateRange): Promise<DashboardMetrics> {
      // Ventas facturadas y entregadas, reconocidas en su mes de ENTREGA (ultima
      // linea "Cerrada" del historial). El filtro por mes se hace en JS.
      const allRows = await getSaleProfitRows({
        status: "INVOICED",
        order: { is: { status: "COMPLETED" } },
      });
      const sales = filterByDeliveryPeriod(allRows, period);
      return summarizeDashboardMetrics(sales);
    },

    async listAccounts(options?: { activeOnly?: boolean }): Promise<Account[]> {
      const rows = (await prisma.account.findMany({
        where: options?.activeOnly ? { isActive: true } : undefined,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          type: true,
          reference: true,
          isActive: true,
          openingBalance: true,
          createdAt: true,
        } satisfies Prisma.AccountSelect,
      })) as AccountSelection[];

      return rows.map(mapAccount);
    },

    async listAccountBalances(period?: DateRange): Promise<AccountBalance[]> {
      // Cada flujo se filtra por su propia fecha contable cuando hay periodo.
      const periodFilter = period ? { gte: period.from, lt: period.to } : undefined;
      const [accounts, incomeByAccount, expenseByAccount, shippingByAccount, operatingExpenseByAccount, movementsByAccount] = await Promise.all([
        prisma.account.findMany({
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            type: true,
            reference: true,
            isActive: true,
            openingBalance: true,
            createdAt: true,
          } satisfies Prisma.AccountSelect,
        }) as unknown as AccountSelection[],
        prisma.salePayment.groupBy({
          by: ["accountId"],
          where: { accountId: { not: null }, ...(periodFilter ? { paymentDate: periodFilter } : {}) },
          _sum: { amount: true },
        }),
        prisma.supplierLedgerEntry.groupBy({
          by: ["accountId"],
          where: { accountId: { not: null }, type: "PAYMENT", ...(periodFilter ? { paymentDate: periodFilter } : {}) },
          _sum: { amount: true },
        }),
        prisma.shippingCost.groupBy({
          by: ["accountId"],
          where: { accountId: { not: null }, ...(periodFilter ? { paymentDate: periodFilter } : {}) },
          _sum: { amount: true },
        }),
        prisma.expense.groupBy({
          by: ["accountId"],
          where: periodFilter ? { expenseDate: periodFilter } : undefined,
          _sum: { amount: true },
        }),
        prisma.accountMovement.groupBy({
          by: ["accountId", "type"],
          where: periodFilter ? { movementDate: periodFilter } : undefined,
          _sum: { amount: true },
        }),
      ]);

      const incomeMap = new Map<string, number>();
      for (const row of incomeByAccount) {
        if (row.accountId) incomeMap.set(row.accountId, toNumber(row._sum.amount));
      }

      const expenseMap = new Map<string, number>();
      for (const row of expenseByAccount) {
        if (row.accountId) expenseMap.set(row.accountId, toNumber(row._sum.amount));
      }
      for (const row of shippingByAccount) {
        if (row.accountId) {
          expenseMap.set(row.accountId, (expenseMap.get(row.accountId) ?? 0) + toNumber(row._sum.amount));
        }
      }
      // Los gastos operativos (nomina, marketing, varios) tambien descuentan del saldo.
      for (const row of operatingExpenseByAccount) {
        expenseMap.set(row.accountId, (expenseMap.get(row.accountId) ?? 0) + toNumber(row._sum.amount));
      }

      const movementInMap = new Map<string, number>();
      const movementOutMap = new Map<string, number>();
      for (const row of movementsByAccount) {
        const amount = toNumber(row._sum.amount);
        // TRANSFER se desglosa en filas IN/OUT al crearse, por eso solo se suman IN y OUT.
        if (row.type === "IN") {
          movementInMap.set(row.accountId, (movementInMap.get(row.accountId) ?? 0) + amount);
        } else if (row.type === "OUT") {
          movementOutMap.set(row.accountId, (movementOutMap.get(row.accountId) ?? 0) + amount);
        }
      }

      // Saldo inicial del periodo = saldo de cierre del mes anterior: el saldo
      // inicial configurado mas TODOS los flujos anteriores al inicio del periodo.
      const openingById = new Map<string, number>();
      for (const account of accounts) {
        openingById.set(account.id, toNumber(account.openingBalance));
      }
      if (period) {
        const priorFilter = { lt: period.from };
        const [pIncome, pSupplierPay, pShipping, pExpense, pMovements] = await Promise.all([
          prisma.salePayment.groupBy({
            by: ["accountId"],
            where: { accountId: { not: null }, paymentDate: priorFilter },
            _sum: { amount: true },
          }),
          prisma.supplierLedgerEntry.groupBy({
            by: ["accountId"],
            where: { accountId: { not: null }, type: "PAYMENT", paymentDate: priorFilter },
            _sum: { amount: true },
          }),
          prisma.shippingCost.groupBy({
            by: ["accountId"],
            where: { accountId: { not: null }, paymentDate: priorFilter },
            _sum: { amount: true },
          }),
          prisma.expense.groupBy({
            by: ["accountId"],
            where: { expenseDate: priorFilter },
            _sum: { amount: true },
          }),
          prisma.accountMovement.groupBy({
            by: ["accountId", "type"],
            where: { movementDate: priorFilter },
            _sum: { amount: true },
          }),
        ]);
        const addPrior = (accountId: string, delta: number) => {
          openingById.set(accountId, (openingById.get(accountId) ?? 0) + delta);
        };
        for (const row of pIncome) if (row.accountId) addPrior(row.accountId, toNumber(row._sum.amount));
        for (const row of pSupplierPay) if (row.accountId) addPrior(row.accountId, -toNumber(row._sum.amount));
        for (const row of pShipping) if (row.accountId) addPrior(row.accountId, -toNumber(row._sum.amount));
        for (const row of pExpense) addPrior(row.accountId, -toNumber(row._sum.amount));
        for (const row of pMovements) {
          const amount = toNumber(row._sum.amount);
          if (row.type === "IN") addPrior(row.accountId, amount);
          else if (row.type === "OUT") addPrior(row.accountId, -amount);
        }
      }

      return accounts.map((account) =>
        summarizeAccountBalance(
          mapAccount(account),
          {
            ingreso: incomeMap.get(account.id) ?? 0,
            gasto: expenseMap.get(account.id) ?? 0,
            movimientosIn: movementInMap.get(account.id) ?? 0,
            movimientosOut: movementOutMap.get(account.id) ?? 0,
          },
          openingById.get(account.id) ?? toNumber(account.openingBalance),
        ),
      );
    },

    async listAccountTransactions(accountId: string): Promise<AccountTransaction[]> {
      const [salePayments, supplierPayments, shippingCosts, expenses, movements] = await Promise.all([
        prisma.salePayment.findMany({
          where: { accountId },
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            note: true,
            paymentDate: true,
            createdAt: true,
            receiptUrl: true,
            receiptName: true,
            sale: { select: { code: true } },
          },
        }),
        prisma.supplierLedgerEntry.findMany({
          where: { accountId, type: "PAYMENT" },
          select: {
            id: true,
            amount: true,
            transactionReference: true,
            note: true,
            paymentDate: true,
            createdAt: true,
            receiptUrl: true,
            receiptName: true,
            supplier: { select: { name: true } },
            sale: { select: { code: true } },
          },
        }),
        prisma.shippingCost.findMany({
          where: { accountId },
          select: {
            id: true,
            amount: true,
            shippingProvider: true,
            transactionReference: true,
            paymentDate: true,
            sale: { select: { code: true } },
          },
        }),
        prisma.expense.findMany({
          where: { accountId },
          select: {
            id: true,
            amount: true,
            description: true,
            reference: true,
            expenseDate: true,
            category: { select: { name: true } },
          },
        }),
        prisma.accountMovement.findMany({
          where: { accountId },
          select: {
            id: true,
            type: true,
            amount: true,
            note: true,
            transferId: true,
            movementDate: true,
          },
        }),
      ]);

      const transactions: AccountTransaction[] = [
        ...salePayments.map((row) => ({
          id: `sale-payment:${row.id}`,
          date: row.paymentDate ?? row.createdAt,
          type: "INCOME" as const,
          concept: row.sale ? `Pago venta ${row.sale.code}` : "Pago de venta",
          reference: row.note ?? row.paymentMethod ?? null,
          amount: toNumber(row.amount),
          receiptUrl: row.receiptUrl ?? null,
          receiptName: row.receiptName ?? null,
        })),
        ...supplierPayments.map((row) => ({
          id: `supplier-payment:${row.id}`,
          date: row.paymentDate ?? row.createdAt,
          type: "EXPENSE" as const,
          concept: `Pago proveedor ${row.supplier.name}${row.sale ? ` (${row.sale.code})` : ""}`,
          reference: row.transactionReference ?? row.note ?? null,
          amount: -toNumber(row.amount),
          receiptUrl: row.receiptUrl ?? null,
          receiptName: row.receiptName ?? null,
        })),
        ...shippingCosts.map((row) => ({
          id: `shipping:${row.id}`,
          date: row.paymentDate,
          type: "EXPENSE" as const,
          concept: `Envio ${row.shippingProvider}${row.sale ? ` (${row.sale.code})` : ""}`,
          reference: row.transactionReference ?? null,
          amount: -toNumber(row.amount),
          receiptUrl: null,
          receiptName: null,
        })),
        ...expenses.map((row) => ({
          id: `expense:${row.id}`,
          date: row.expenseDate,
          type: "EXPENSE" as const,
          concept: `Gasto ${row.category.name}${row.description ? ` - ${row.description}` : ""}`,
          reference: row.reference ?? null,
          amount: -toNumber(row.amount),
          receiptUrl: null,
          receiptName: null,
        })),
        ...movements.map((row) => ({
          id: `movement:${row.id}`,
          date: row.movementDate,
          type: row.type === "IN" ? ("MOVEMENT_IN" as const) : ("MOVEMENT_OUT" as const),
          concept:
            row.note ??
            (row.transferId ? "Traslado entre cuentas" : row.type === "IN" ? "Ingreso manual" : "Retiro manual"),
          reference: row.transferId ? "Traslado" : null,
          amount: row.type === "IN" ? toNumber(row.amount) : -toNumber(row.amount),
          receiptUrl: null,
          receiptName: null,
        })),
      ];

      return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
    },

    async createAccount(input: CreateAccountInput): Promise<Account> {
      const row = (await prisma.account.create({
        data: {
          name: input.name,
          type: input.type,
          reference: input.reference ?? null,
          openingBalance: input.openingBalance,
          createdById: input.createdById,
        },
        select: {
          id: true,
          name: true,
          type: true,
          reference: true,
          isActive: true,
          openingBalance: true,
          createdAt: true,
        } satisfies Prisma.AccountSelect,
      })) as AccountSelection;

      return mapAccount(row);
    },

    async updateAccount(accountId: string, input: UpdateAccountInput): Promise<Account> {
      const row = (await prisma.account.update({
        where: { id: accountId },
        data: {
          name: input.name,
          type: input.type,
          reference: input.reference ?? null,
          openingBalance: input.openingBalance,
          isActive: input.isActive,
        },
        select: {
          id: true,
          name: true,
          type: true,
          reference: true,
          isActive: true,
          openingBalance: true,
          createdAt: true,
        } satisfies Prisma.AccountSelect,
      })) as AccountSelection;

      return mapAccount(row);
    },

    async createAccountMovement(input: CreateAccountMovementInput): Promise<void> {
      if (input.type === "TRANSFER") {
        if (!input.toAccountId) {
          throw new Error("La cuenta destino es obligatoria para un traslado.");
        }

        const transferId = randomUUID();
        await prisma.$transaction([
          prisma.accountMovement.create({
            data: {
              accountId: input.accountId,
              type: "OUT",
              amount: input.amount,
              note: input.note ?? null,
              transferId,
              movementDate: input.movementDate,
              createdById: input.createdById,
            },
          }),
          prisma.accountMovement.create({
            data: {
              accountId: input.toAccountId,
              type: "IN",
              amount: input.amount,
              note: input.note ?? null,
              transferId,
              movementDate: input.movementDate,
              createdById: input.createdById,
            },
          }),
        ]);
        return;
      }

      await prisma.accountMovement.create({
        data: {
          accountId: input.accountId,
          type: input.type,
          amount: input.amount,
          note: input.note ?? null,
          movementDate: input.movementDate,
          createdById: input.createdById,
        },
      });
    },
  };
}
