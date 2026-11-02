import type { Prisma } from "@prisma/client";
import { dbWindow, inColombiaPeriod } from "@/lib/colombia-time";
import { prisma } from "@/lib/prisma";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";
import type {
  DayRange,
  ExpenseLine,
  OrderTracking,
  ProductRow,
  QuoteRow,
  QuoteStatusCode,
  SaleDetail,
  Seller,
  SupplierLedger,
} from "../domain/entities";
import type { SaleLedgerInput } from "../domain/payments";
import { describeProductSource } from "../domain/product-source";
import { buildQuoteProductSummary, buildSaleProducts, type SaleProductItemInput } from "../domain/sale-products";
import type { AsesorReadRepository, SaleLedgerFilter } from "../domain/repository";

// Adaptador Prisma de SOLO LECTURA: unicamente findMany (ningun create/update/delete).

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toSeller(
  user: { id: string; name: string | null; email: string; role?: string | null } | null | undefined,
): Seller | null {
  if (!user) return null;
  return { id: user.id, name: user.name?.trim() || user.email, role: user.role ?? null };
}

const userSelect = { id: true, name: true, email: true, role: true } as const;

// Producto con lo necesario para el costo (computeItemUnitCost): base, flete y proveedor preferido.
const costProductSelect = {
  name: true,
  code: true,
  thumbnailUrl: true,
  description: true,
  baseCost: true,
  additionalCost: true,
  suppliers: { where: { isPreferred: true }, take: 1, select: { supplierCost: true } },
} as const;

function toSaleProductItem(item: {
  id: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  notes: string | null;
  fulfillmentMode: string;
  purchaseCost?: Prisma.Decimal | null;
  product: {
    name: string;
    code: string | null;
    thumbnailUrl: string | null;
    description: string | null;
    baseCost: Prisma.Decimal;
    additionalCost: Prisma.Decimal;
    suppliers: { supplierCost: Prisma.Decimal | null }[];
  };
}): SaleProductItemInput {
  const { suppliers, ...product } = item.product;
  return {
    ...item,
    product: { ...product, preferredSupplierCost: suppliers[0]?.supplierCost ?? null },
  };
}

// Item de orden o cotizacion para la lista corta de productos (buildQuoteProductSummary).
const quoteSummaryItemSelect = {
  id: true,
  quantity: true,
  unitPrice: true,
  lineTotal: true,
  notes: true,
  product: { select: { name: true, code: true, thumbnailUrl: true, description: true } },
} as const;

// Venta con sus abonos y la entrega: la base de pagado y saldo (buildSaleLedger).
const ledgerSelect = {
  id: true,
  code: true,
  status: true,
  paymentMethod: true,
  total: true,
  downPaymentAmount: true,
  createdAt: true,
  client: { select: { name: true } },
  quote: { select: { code: true, createdAt: true, createdBy: { select: userSelect } } },
  salePayments: {
    orderBy: { sortOrder: "asc" },
    select: {
      amount: true,
      paymentDate: true,
      createdAt: true,
      paymentMethod: true,
      note: true,
      isWithholding: true,
      withholdingCertificate: true,
      account: { select: { name: true } },
    },
  },
  order: {
    select: {
      status: true,
      completedAt: true,
      // Misma fecha de entrega que Balances: ultima linea "Cerrada" del historial.
      history: {
        where: { toStatus: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  },
} satisfies Prisma.SaleSelect;

function toLedgerInput(sale: Prisma.SaleGetPayload<{ select: typeof ledgerSelect }>): SaleLedgerInput {
  return {
    saleId: sale.id,
    saleCode: sale.code,
    quoteCode: sale.quote?.code ?? null,
    quoteCreatedAt: sale.quote?.createdAt ?? null,
    saleCreatedAt: sale.createdAt,
    clientName: sale.client?.name ?? null,
    sellerName: toSeller(sale.quote?.createdBy)?.name ?? null,
    saleStatus: sale.status,
    orderStatus: sale.order?.status ?? null,
    paymentMethod: sale.paymentMethod ?? null,
    total: toNumber(sale.total),
    recordedPaid: toNumber(sale.downPaymentAmount),
    deliveredAt:
      sale.order?.status === "COMPLETED"
        ? (sale.order.history[0]?.createdAt ?? sale.order.completedAt ?? null)
        : null,
    payments: sale.salePayments.map((payment) => ({
      amount: toNumber(payment.amount),
      paymentDate: payment.paymentDate,
      registeredAt: payment.createdAt,
      accountName: payment.account?.name ?? null,
      method: payment.paymentMethod || null,
      note: payment.note,
      isWithholding: payment.isWithholding,
      withholdingCertificate: payment.withholdingCertificate,
    })),
  };
}

export function createPrismaAsesorRepository(): AsesorReadRepository {
  return {
    async getSaleDetails(saleIds: string[]): Promise<SaleDetail[]> {
      if (saleIds.length === 0) return [];

      const sales = await prisma.sale.findMany({
        where: { id: { in: saleIds } },
        select: {
          id: true,
          code: true,
          invoiceToken: true,
          createdAt: true,
          origin: true,
          originDetail: true,
          client: { select: { name: true } },
          createdBy: { select: userSelect },
          quote: {
            select: {
              code: true,
              shareToken: true,
              createdBy: { select: userSelect },
              items: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  quantity: true,
                  unitPrice: true,
                  lineTotal: true,
                  notes: true,
                  fulfillmentMode: true,
                  product: { select: costProductSelect },
                },
              },
            },
          },
          order: {
            select: {
              code: true,
              manufacturingOrders: {
                orderBy: { createdAt: "asc" },
                select: { code: true, supplierId: true, shareToken: true, supplier: { select: { name: true } } },
              },
              items: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  quantity: true,
                  unitPrice: true,
                  lineTotal: true,
                  notes: true,
                  fulfillmentMode: true,
                  purchaseCost: true,
                  confirmedSupplierId: true,
                  confirmedSupplier: { select: { name: true } },
                  product: { select: costProductSelect },
                },
              },
            },
          },
        },
      });

      return sales.map((sale) => {
        const { fuente, productos } = buildSaleProducts({
          orderItems: sale.order?.items.map(toSaleProductItem),
          quoteItems: sale.quote?.items.map(toSaleProductItem),
        });
        return {
          saleId: sale.id,
          saleCode: sale.code,
          quoteCode: sale.quote?.code ?? null,
          orderCode: sale.order?.code ?? null,
          saleDate: sale.createdAt,
          clientName: sale.client?.name ?? null,
          seller: toSeller(sale.quote?.createdBy),
          registeredBy: toSeller(sale.createdBy),
          origin: sale.origin ?? null,
          originDetail: sale.originDetail ?? null,
          productSource: describeProductSource({
            lines: sale.order
              ? sale.order.items.map((item) => ({
                  productName: item.product.name,
                  quantity: item.quantity,
                  fulfillmentMode: item.fulfillmentMode,
                  supplierId: item.confirmedSupplierId,
                  supplierName: item.confirmedSupplier?.name ?? null,
                }))
              : null,
            manufacturingOrders: sale.order?.manufacturingOrders ?? [],
          }),
          // Productos de la orden o, si no tiene items, de la cotizacion (combos agrupados).
          products: productos,
          productsSource: fuente,
          quoteShareToken: sale.quote?.shareToken ?? null,
          invoiceToken: sale.invoiceToken,
          manufacturingOrders: (sale.order?.manufacturingOrders ?? []).map((of) => ({
            code: of.code,
            supplierName: of.supplier.name,
            shareToken: of.shareToken,
          })),
        };
      });
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
          shareToken: true,
          createdBy: { select: userSelect },
          sale: { select: { code: true, invoiceToken: true } },
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
      });

      return quotes.map((quote) => ({
        quoteCode: quote.code,
        createdAt: quote.createdAt,
        status: quote.status,
        total: toNumber(quote.total),
        clientName: quote.client?.name ?? null,
        seller: toSeller(quote.createdBy),
        saleCode: quote.sale?.code ?? null,
        shareToken: quote.shareToken,
        saleInvoiceToken: quote.sale?.invoiceToken ?? null,
        products: buildQuoteProductSummary(quote.items),
      }));
    },

    async listRetroactivos({ desde, hasta, tipo }) {
      // Misma consulta que /admin/retroactivos (mes del registro real y tipo).
      const found = await prisma.registroRetroactivo.findMany({
        where: { registradoEn: { gte: desde, lt: hasta }, ...(tipo ? { tipo } : {}) },
        orderBy: { registradoEn: "desc" },
        select: {
          usuarioId: true,
          tipo: true,
          registroId: true,
          fechaPuesta: true,
          registradoEn: true,
          motivo: true,
          monto: true,
          usuario: { select: { name: true, email: true } },
        },
      });
      return found.map((row) => ({
        usuarioId: row.usuarioId,
        usuarioNombre: row.usuario.name ?? row.usuario.email,
        tipo: row.tipo,
        registroId: row.registroId,
        fechaPuesta: row.fechaPuesta,
        registradoEn: row.registradoEn,
        motivo: row.motivo,
        monto: toNumber(row.monto),
      }));
    },

    async listExpenses(range: DayRange): Promise<ExpenseLine[]> {
      // La fecha del gasto es escrita (medianoche UTC) o un momento: ventana amplia y luego dia de Colombia.
      const period = { start: range.from, end: range.to };
      const window = dbWindow(period);
      const found = await prisma.expense.findMany({
        where: { expenseDate: { gte: window.start, lt: window.end } },
        orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          expenseDate: true,
          amount: true,
          description: true,
          receiptUrl: true,
          category: { select: { name: true } },
          account: { select: { name: true } },
          employee: { select: { name: true, email: true } },
        },
      });
      const rows = found.filter((row) => inColombiaPeriod(row.expenseDate, period));
      return rows.map((row) => ({
        id: row.id,
        date: row.expenseDate,
        category: row.category.name,
        account: row.account.name,
        amount: toNumber(row.amount),
        note: row.description,
        person: row.employee ? row.employee.name?.trim() || row.employee.email : null,
        hasReceipt: Boolean(row.receiptUrl),
      }));
    },

    async listSupplierLedgers(): Promise<SupplierLedger[]> {
      const suppliers = await prisma.supplier.findMany({
        where: { ledgerEntries: { some: {} } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          ledgerEntries: {
            orderBy: { createdAt: "asc" },
            select: {
              type: true,
              amount: true,
              orderId: true,
              paymentDate: true,
              createdAt: true,
              note: true,
              account: { select: { name: true } },
            },
          },
        },
      });
      const orderIds = [...new Set(suppliers.flatMap((s) => s.ledgerEntries.flatMap((e) => (e.orderId ? [e.orderId] : []))))];
      const orders = orderIds.length
        ? await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              code: true,
              createdAt: true,
              sale: { select: { code: true } },
              client: { select: { name: true } },
              manufacturingOrders: { select: { supplierId: true, code: true, createdAt: true } },
              items: {
                orderBy: { createdAt: "asc" },
                select: {
                  quantity: true,
                  notes: true,
                  confirmedSupplierId: true,
                  product: { select: { name: true } },
                },
              },
            },
          })
        : [];
      const orderById = new Map(orders.map((order) => [order.id, order]));

      return suppliers.map((supplier) => {
        const supplierOrderIds = [...new Set(supplier.ledgerEntries.flatMap((e) => (e.orderId ? [e.orderId] : [])))];
        return {
          supplierId: supplier.id,
          name: supplier.name,
          entries: supplier.ledgerEntries.map((entry) => ({
            type: entry.type,
            amount: toNumber(entry.amount),
            orderId: entry.orderId,
            date: entry.paymentDate ?? entry.createdAt,
            accountName: entry.account?.name ?? null,
            note: entry.note,
          })),
          orders: supplierOrderIds.flatMap((orderId) => {
            const order = orderById.get(orderId);
            if (!order) return [];
            const of = order.manufacturingOrders.find((record) => record.supplierId === supplier.id);
            return [
              {
                orderId,
                orderCode: order.code,
                manufacturingCode: of?.code ?? null,
                date: of?.createdAt ?? order.createdAt,
                saleCode: order.sale?.code ?? null,
                clientName: order.client?.name ?? null,
                products: order.items
                  .filter((item) => item.confirmedSupplierId === supplier.id)
                  .map((item) => ({
                    nombre: item.product.name,
                    cantidad: item.quantity,
                    color: parseQuoteItemMeta(item.notes).color.trim() || null,
                  })),
              },
            ];
          }),
        };
      });
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
    async listOrderTrackings(filter): Promise<OrderTracking[]> {
      // Solo lectura: un findMany. Abiertos = sin orden o con la orden sin entregar ni cancelar.
      const sales = await prisma.sale.findMany({
        where: {
          status: { not: "CANCELLED" },
          ...(filter?.soloAbiertos
            ? { OR: [{ order: { is: null } }, { order: { is: { status: { notIn: ["COMPLETED", "CANCELLED"] } } } }] }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          ...ledgerSelect,
          client: { select: { name: true, phone: true, city: true, department: true } },
          quote: {
            select: {
              ...ledgerSelect.quote.select,
              items: {
                orderBy: { createdAt: "asc" },
                select: quoteSummaryItemSelect,
              },
            },
          },
          order: {
            select: {
              code: true,
              status: true,
              createdAt: true,
              completedAt: true,
              history: { orderBy: { createdAt: "desc" }, select: { toStatus: true, createdAt: true } },
              items: { orderBy: { createdAt: "asc" }, select: quoteSummaryItemSelect },
              manufacturingOrders: {
                orderBy: { createdAt: "asc" },
                select: { code: true, supplier: { select: { name: true } } },
              },
              dispatches: {
                orderBy: { createdAt: "asc" },
                select: {
                  code: true,
                  carrierName: true,
                  carrierSupplier: { select: { name: true } },
                  trackingNumber: true,
                  shippingAddress: true,
                  shippedAt: true,
                  deliveredAt: true,
                },
              },
            },
          },
        },
      });

      return sales.map((sale) => {
        const order = sale.order;
        const orderItems = order?.items ?? [];
        return {
          // El ledger solo necesita la ultima entrada "Cerrada" (fecha de entrega de Balances).
          ledger: toLedgerInput({
            ...sale,
            order: order && { ...order, history: order.history.filter((h) => h.toStatus === "COMPLETED") },
          }),
          orderCode: order?.code ?? null,
          orderCreatedAt: order?.createdAt ?? null,
          clientPhone: sale.client.phone?.trim() || null,
          city: sale.client.city?.trim() || null,
          department: sale.client.department?.trim() || null,
          // Productos de la orden o, si no tiene items, de la cotizacion (combos agrupados, con color).
          products: buildQuoteProductSummary(orderItems.length > 0 ? orderItems : (sale.quote?.items ?? [])),
          manufacturingOrders: (order?.manufacturingOrders ?? []).map((of) => ({ code: of.code, supplierName: of.supplier.name })),
          statusChanges: (order?.history ?? []).map((h) => ({ toStatus: h.toStatus, at: h.createdAt })),
          dispatches: (order?.dispatches ?? []).map((dispatch) => ({
            code: dispatch.code,
            carrierName: dispatch.carrierName?.trim() || dispatch.carrierSupplier?.name || null,
            trackingNumber: dispatch.trackingNumber,
            shippingAddress: dispatch.shippingAddress,
            shippedAt: dispatch.shippedAt,
            deliveredAt: dispatch.deliveredAt,
          })),
        };
      });
    },
    async listSaleLedgers(filter?: SaleLedgerFilter): Promise<SaleLedgerInput[]> {
      const where: Prisma.SaleWhereInput = {};
      if (filter?.saleIds) where.id = { in: filter.saleIds };
      if (filter?.saleCodes) where.code = { in: filter.saleCodes };
      if ((filter?.saleIds && filter.saleIds.length === 0) || (filter?.saleCodes && filter.saleCodes.length === 0)) {
        return [];
      }

      const sales = await prisma.sale.findMany({ where, orderBy: { createdAt: "asc" }, select: ledgerSelect });
      return sales.map(toLedgerInput);
    },
  };
}
