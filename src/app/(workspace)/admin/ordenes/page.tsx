import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { OrdersWorkspace } from "@/components/admin/orders-workspace";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { createPrismaInventoryRepository } from "@/modules/inventory/infrastructure/prisma-inventory-repository";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminOrdenesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "orders");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const repository = createPrismaInventoryRepository();
  const [orders, currency, productStocks, bundleProducts, productSupplierRows] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sale: true,
        client: true,
        assignedTo: true,
      },
      take: 200,
    }),
    getSystemCurrency(),
    // Productos que manejan inventario (para la compra directa a proveedor).
    repository.listProductStocks(),
    // Combos: no manejan stock propio, pero se pueden comprar (reparten stock a
    // sus componentes). Se listan aparte porque listProductStocks los excluye.
    prisma.product.findMany({
      where: { isBundle: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        baseCost: true,
        thumbnailUrl: true,
        bundleComponents: {
          orderBy: { sortOrder: "asc" },
          select: {
            childId: true,
            quantity: true,
            child: { select: { name: true, code: true, thumbnailUrl: true } },
          },
        },
      },
    }),
    prisma.productSupplier.findMany({
      where: { supplier: { isActive: true } },
      orderBy: [{ isPreferred: "desc" }, { supplier: { name: "asc" } }],
      select: {
        productId: true,
        supplierCost: true,
        supplier: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Stock por producto (componentes) para calcular cuantos combos se pueden armar.
  const stockByProduct = new Map(productStocks.map((stock) => [stock.productId, stock.stock]));
  // Stock de un combo = minimo de (stock del componente / unidades requeridas).
  const bundleStock = (components: { childId: string; quantity: number }[]): number => {
    const valid = components.filter((component) => component.quantity > 0);
    if (valid.length === 0) return 0;
    return Math.min(
      ...valid.map((component) => Math.floor((stockByProduct.get(component.childId) ?? 0) / component.quantity)),
    );
  };

  // Componentes de cada combo (para listar cada item con su proveedor y precio).
  const purchaseComboComponents: Record<
    string,
    { childId: string; name: string; code: string | null; quantity: number; thumbnailUrl: string }[]
  > = {};
  for (const bundle of bundleProducts) {
    purchaseComboComponents[bundle.id] = bundle.bundleComponents.map((component) => ({
      childId: component.childId,
      name: component.child.name,
      code: component.child.code,
      quantity: component.quantity,
      thumbnailUrl: getPublicAssetUrl(component.child.thumbnailUrl),
    }));
  }

  // Proveedores (con su costo) asociados a cada producto, para autocompletar.
  const purchaseSuppliersByProduct: Record<string, { id: string; name: string; cost: number | null }[]> = {};
  for (const row of productSupplierRows) {
    (purchaseSuppliersByProduct[row.productId] ??= []).push({
      id: row.supplier.id,
      name: row.supplier.name,
      cost: row.supplierCost === null ? null : Number(row.supplierCost),
    });
  }

  const stats = orders.reduce(
    (acc, order) => {
      acc.ordersCount += 1;
      if (order.status !== "COMPLETED" && order.status !== "CANCELLED") {
        acc.activeCount += 1;
      }
      if (order.status === "IN_PRODUCTION") {
        acc.productionCount += 1;
      }
      if (order.status === "READY_FOR_DISPATCH") {
        acc.readyToDispatchCount += 1;
      }
      if (order.status === "COMPLETED") {
        acc.completedCount += 1;
      }
      return acc;
    },
    {
      ordersCount: 0,
      activeCount: 0,
      productionCount: 0,
      readyToDispatchCount: 0,
      completedCount: 0,
    },
  );

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Ordenes actualizadas"
        errorTitle="Error en ordenes"
      />

      <OrdersWorkspace
        currency={currency}
        stats={stats}
        orders={orders.map((order) => ({
          id: order.id,
          code: order.code,
          saleCode: order.sale.code,
          clientName: order.client.name || order.client.email,
          assignedToName: order.assignedTo?.name ?? order.assignedTo?.email ?? null,
          total: Number(order.total),
          status: order.status,
          createdAt: order.createdAt.toLocaleDateString("es-CO"),
        }))}
        purchaseProducts={[
          ...productStocks.map((stock) => ({
            id: stock.productId,
            name: stock.name,
            code: stock.code,
            baseCost: stock.baseCost,
            stock: stock.stock,
            thumbnailUrl: getPublicAssetUrl(stock.thumbnailUrl),
            isBundle: false,
          })),
          ...bundleProducts.map((bundle) => ({
            id: bundle.id,
            name: bundle.name,
            code: bundle.code,
            baseCost: Number(bundle.baseCost),
            stock: bundleStock(bundle.bundleComponents),
            thumbnailUrl: getPublicAssetUrl(bundle.thumbnailUrl),
            isBundle: true,
          })),
        ]}
        purchaseSuppliersByProduct={purchaseSuppliersByProduct}
        purchaseComboComponents={purchaseComboComponents}
      />
    </section>
  );
}
