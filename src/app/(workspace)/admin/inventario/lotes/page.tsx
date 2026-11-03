import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { displayCode } from "@/lib/code-display";
import { prisma } from "@/lib/prisma";
import { summarizeSupplierDebt } from "@/lib/supplier-debt";
import { getSystemCurrency } from "@/lib/system-settings";
import { lotLineTotal } from "@/modules/inventory/domain/purchase-lot";
import {
  PurchaseLotsView,
  type PurchaseLot,
  type SaleOrderOption,
} from "@/modules/inventory/presentation/purchase-lots-view";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminInventoryLotsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "inventory");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [orders, saleOrders, currency] = await Promise.all([
    prisma.order.findMany({
      where: { type: "PURCHASE", lotUnits: { some: {} } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        purchaseCode: true,
        supplier: { select: { name: true } },
        items: {
          select: {
            productId: true,
            lineTotal: true,
            notes: true,
            confirmedSupplier: { select: { name: true } },
          },
        },
        lotUnits: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            estado: true,
            ubicacion: true,
            color: true,
            saleOrder: { select: { code: true } },
            product: { select: { id: true, name: true, isBundle: true } },
          },
        },
      },
    }),
    prisma.order.findMany({
      where: { type: "SALE", status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        code: true,
        client: { select: { name: true } },
        items: { select: { productId: true } },
      },
    }),
    getSystemCurrency(),
  ]);

  // Pagado y saldo por compra: cargos y abonos de la orden, más los abonos sin orden que saldan uno de sus cargos.
  const orderIds = orders.map((order) => order.id);
  const ledger = orderIds.length
    ? await prisma.supplierLedgerEntry.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true, type: true, amount: true, orderId: true },
      })
    : [];
  const chargeOrder = new Map(ledger.filter((e) => e.type === "CHARGE").map((e) => [e.id, e.orderId]));
  const settling = chargeOrder.size
    ? await prisma.supplierLedgerEntry.findMany({
        where: { type: "PAYMENT", orderId: null, settlesEntryId: { in: [...chargeOrder.keys()] } },
        select: { type: true, amount: true, settlesEntryId: true },
      })
    : [];
  const debt = summarizeSupplierDebt([
    ...ledger.map((e) => ({ type: e.type, amount: Number(e.amount), orderId: e.orderId })),
    ...settling.map((e) => ({ type: e.type, amount: Number(e.amount), orderId: chargeOrder.get(e.settlesEntryId!) ?? null })),
  ]);
  const debtByOrder = new Map(debt.orders.map((d) => [d.orderId, d]));

  const lots: PurchaseLot[] = orders.flatMap((order) => {
    const items = order.items.map((item) => ({ ...item, lineTotal: Number(item.lineTotal) }));
    const supplierName =
      order.supplier?.name ?? items.find((item) => item.confirmedSupplier)?.confirmedSupplier?.name ?? "Sin proveedora";
    const orderDebt = debtByOrder.get(order.id);
    // Un lote por producto de la compra (una compra puede traer varios productos por lote).
    const byProduct = new Map<string, typeof order.lotUnits>();
    for (const unit of order.lotUnits) {
      byProduct.set(unit.productId, [...(byProduct.get(unit.productId) ?? []), unit]);
    }
    return [...byProduct.values()].map((units) => {
      const product = units[0].product;
      const total = lotLineTotal(items, product);
      return {
        key: `${order.id}:${product.id}`,
        orderId: order.id,
        code: displayCode(order.purchaseCode ?? order.code),
        orderCode: displayCode(order.code),
        supplierName,
        productId: product.id,
        productName: product.name,
        quantity: units.length,
        unitCost: units.length ? Math.round(total / units.length) : 0,
        total,
        paid: orderDebt?.paid ?? 0,
        pending: orderDebt?.pending ?? 0,
        units: units.map((unit) => ({
          id: unit.id,
          estado: unit.estado,
          ubicacion: unit.ubicacion,
          color: unit.color,
          saleOrderCode: unit.saleOrder ? displayCode(unit.saleOrder.code) : null,
        })),
      };
    });
  });

  const saleOrderOptions: SaleOrderOption[] = saleOrders.map((order) => ({
    id: order.id,
    label: `${displayCode(order.code)}${order.client?.name ? ` · ${order.client.name}` : ""}`,
    productIds: [...new Set(order.items.map((item) => item.productId))],
  }));

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Lote actualizado"
        errorTitle="No se pudo actualizar el lote"
      />
      <PurchaseLotsView
        lots={lots}
        saleOrders={saleOrderOptions}
        currency={currency}
        canEdit={session.user.role === "ADMIN"}
      />
    </section>
  );
}
