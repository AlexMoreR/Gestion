import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { SalesWorkspace } from "@/components/admin/sales-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";
import {
  COMBO_CHECK_PRODUCT_SELECT,
  isCamillaComboProduct,
  toComboCheckProduct,
} from "@/modules/ventas/domain/payment-method";
import { parseOriginFilter } from "@/modules/ventas/domain/sale-origin";
import { SaleOriginFilterBar } from "@/modules/ventas/presentation/sale-origin-filter-bar";

type SaleWithDiscountFields = {
  grossTotal?: unknown;
  discountAmount?: unknown;
  quote: {
    total: unknown;
  };
  salePayments?: Array<{
    id?: unknown;
    amount: unknown;
    paymentMethod?: unknown;
    note?: unknown;
    receiptUrl?: unknown;
    receiptName?: unknown;
    receiptType?: unknown;
    paymentDate?: unknown;
    createdAt?: unknown;
  }>;
};

function formatPaymentDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toLocaleDateString("es-CO");
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString("es-CO");
  }
  return null;
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminVentasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "sales");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";
  const initialSearch = typeof params.q === "string" ? params.q : "";
  // ?origen=META_ADS|MARKETPLACE|...|SIN_DATO. "Sin dato" incluye las ventas viejas (NULL).
  const originFilter = parseOriginFilter(params.origen);
  const originWhere: Prisma.SaleWhereInput | undefined = originFilter
    ? originFilter === "SIN_DATO"
      ? { OR: [{ origin: null }, { origin: "SIN_DATO" }] }
      : { origin: originFilter }
    : undefined;

  const [sales, products, clients, currency, accounts, stockRows] = await Promise.all([
    prisma.sale.findMany({
      where: originWhere,
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        quote: {
          include: { items: { select: { product: { select: COMBO_CHECK_PRODUCT_SELECT } } } },
        },
        order: true,
        salePayments: {
          orderBy: { sortOrder: "asc" },
        },
      },
      take: 200,
    }),
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        bundleComponents: {
          orderBy: { sortOrder: "asc" },
          include: { child: true },
        },
        category: { select: { name: true } },
        partOfBundles: COMBO_CHECK_PRODUCT_SELECT.partOfBundles,
      },
      take: 500,
    }),
    prisma.user.findMany({
      where: { role: "CLIENTE" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        document: true,
        phone: true,
        address: true,
      },
      take: 400,
    }),
    getSystemCurrency(),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    // Stock por producto (suma de movimientos) para la bolita del selector.
    prisma.inventoryMovement.groupBy({
      by: ["productId"],
      _sum: { change: true },
    }),
  ]);

  // Stock de productos normales; para combos, cuantos se pueden armar con sus
  // componentes (minimo de stock del componente / unidades requeridas).
  const stockByProduct = new Map(stockRows.map((row) => [row.productId, row._sum.change ?? 0]));
  const stockFor = (product: (typeof products)[number]): number => {
    if (product.isBundle) {
      const valid = product.bundleComponents.filter((component) => component.quantity > 0);
      if (valid.length === 0) return 0;
      return Math.min(
        ...valid.map((component) => Math.floor((stockByProduct.get(component.childId) ?? 0) / component.quantity)),
      );
    }
    return stockByProduct.get(product.id) ?? 0;
  };

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Ventas actualizadas"
        errorTitle="Error en ventas"
      />

      <SaleOriginFilterBar active={originFilter} search={initialSearch} />

      <SalesWorkspace
        currency={currency}
        accounts={accounts}
        initialSearch={initialSearch}
        clients={clients.map((client) => ({
          id: client.id,
          name: client.name || "Cliente sin nombre",
          email: client.email,
          document: client.document ?? "",
          phone: client.phone ?? "",
          address: client.address ?? "",
        }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          code: product.code,
          stock: stockFor(product),
          retailPrice: Number(product.price),
          wholesalePrice: Number(product.wholesalePrice),
          minWholesaleQty: product.minWholesaleQty,
          thumbnailUrl: getPublicAssetUrl(product.thumbnailUrl),
          isBundle: product.isBundle,
          isCamillaCombo: isCamillaComboProduct(toComboCheckProduct(product)),
          components: product.bundleComponents.map((component) => ({
            productId: component.childId,
            name: component.child.name,
            code: component.child.code,
            quantity: component.quantity,
            retailPrice: Number(component.child.price),
            thumbnailUrl: getPublicAssetUrl(component.child.thumbnailUrl),
          })),
        }))}
        sales={sales.map((sale) => ({
          id: sale.id,
          code: sale.code,
          quoteCode: sale.quote.code,
          clientName: sale.client.name || sale.client.email,
          total: Number(sale.total),
          grossTotal: Number((sale as SaleWithDiscountFields).grossTotal ?? sale.quote.total),
          discountAmount: Number((sale as SaleWithDiscountFields).discountAmount ?? 0),
          downPaymentAmount: Array.isArray((sale as SaleWithDiscountFields).salePayments)
            ? (sale as SaleWithDiscountFields).salePayments!.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
            : Number(sale.downPaymentAmount),
          remainingBalance: Math.max(
            Number(sale.total) -
              (Array.isArray((sale as SaleWithDiscountFields).salePayments)
                ? (sale as SaleWithDiscountFields).salePayments!.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
                : Number(sale.downPaymentAmount)),
            0,
          ),
          status: sale.status,
          createdAt: sale.createdAt.toLocaleDateString("es-CO"),
          createdAtISO: sale.createdAt.toISOString(),
          invoiceToken: sale.invoiceToken,
          paymentReceiptUrl: sale.paymentReceiptUrl,
          paymentReceiptType: sale.paymentReceiptType,
          salePayments: Array.isArray((sale as SaleWithDiscountFields).salePayments)
            ? (sale as SaleWithDiscountFields).salePayments!.map((payment) => ({
                id: typeof payment.id === "string" ? payment.id : "",
                amount: Number(payment.amount ?? 0),
                paymentMethod: typeof payment.paymentMethod === "string" ? payment.paymentMethod : "",
                note: typeof payment.note === "string" && payment.note.trim() ? payment.note.trim() : null,
                receiptUrl: typeof payment.receiptUrl === "string" && payment.receiptUrl.trim() ? payment.receiptUrl.trim() : null,
                receiptName: typeof payment.receiptName === "string" && payment.receiptName.trim() ? payment.receiptName.trim() : null,
                receiptType: typeof payment.receiptType === "string" && payment.receiptType.trim() ? payment.receiptType.trim() : null,
                paidAt: formatPaymentDate(payment.paymentDate ?? payment.createdAt),
              }))
            : [],
          hasOrder: Boolean(sale.order),
          orderId: sale.order?.id ?? null,
          salePaymentMethod: sale.paymentMethod ?? null,
          saleOrigin: sale.origin ?? null,
          saleOriginDetail: sale.originDetail ?? null,
          hasCamillaCombo: sale.quote.items.some((item) => isCamillaComboProduct(toComboCheckProduct(item.product))),
        }))}
      />
    </section>
  );
}
