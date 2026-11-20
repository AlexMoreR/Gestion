import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SuppliersWorkspace } from "@/components/admin/suppliers-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemCurrency } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";
import { summarizeSupplierDebt } from "@/lib/supplier-debt";
import { SupplierPayablesSection } from "@/components/admin/supplier-payables-section";
import { buildSupplierPayables, type PayableOrderInfo } from "@/lib/supplier-payables";
import { parseQuoteItemMeta } from "@/lib/quote-item-meta";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProveedoresPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "suppliers");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [suppliers, currency] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: true } },
        // Solo para el saldo: el detalle de la cuenta se ve en /admin/proveedores/[id]/cuenta.
        ledgerEntries: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            amount: true,
            orderId: true,
            settlesEntryId: true,
            code: true,
            inventoryMovementId: true,
            note: true,
          },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  // Asegura un token de link publico para cada proveedor (se genera una sola vez).
  const tokenUpdates: Promise<unknown>[] = [];
  for (const supplier of suppliers) {
    if (!supplier.shareToken) {
      supplier.shareToken = randomUUID();
      tokenUpdates.push(
        prisma.supplier.update({ where: { id: supplier.id }, data: { shareToken: supplier.shareToken } }),
      );
    }
  }
  if (tokenUpdates.length > 0) {
    await Promise.all(tokenUpdates);
  }

  // "Por pagar hoy": solo para el dueño/administradores (rol ADMIN). Solo lectura.
  let payables: ReturnType<typeof buildSupplierPayables> | null = null;
  if (session.user.role === "ADMIN") {
    const ledgers = suppliers.map((supplier) => ({
      supplier,
      entries: supplier.ledgerEntries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: Number(entry.amount),
        orderId: entry.orderId,
        settlesEntryId: entry.settlesEntryId,
        code: entry.code,
        isInventory: Boolean(entry.inventoryMovementId || entry.note?.startsWith("Compra inventario")),
      })),
    }));
    // Solo las órdenes que aún tienen saldo con alguna proveedora.
    const orderIds = ledgers.flatMap(({ entries }) =>
      summarizeSupplierDebt(entries)
        .orders.filter((order) => order.pending > 0.0001)
        .map((order) => order.orderId),
    );
    const orders = orderIds.length
      ? await prisma.order.findMany({
          where: { id: { in: [...new Set(orderIds)] } },
          select: {
            id: true,
            code: true,
            type: true,
            status: true,
            sale: { select: { code: true, paymentMethod: true } },
            client: { select: { name: true } },
            manufacturingOrders: { select: { supplierId: true, code: true } },
            items: {
              orderBy: { createdAt: "asc" },
              select: { quantity: true, notes: true, confirmedSupplierId: true, product: { select: { name: true } } },
            },
          },
        })
      : [];
    const orderById = new Map(orders.map((order) => [order.id, order]));
    payables = buildSupplierPayables(
      ledgers.map(({ supplier, entries }) => {
        const infos = new Map<string, PayableOrderInfo>();
        for (const entry of entries) {
          const order = entry.orderId ? orderById.get(entry.orderId) : undefined;
          if (!order || infos.has(order.id)) continue;
          infos.set(order.id, {
            orderCode: order.code,
            manufacturingCode: order.manufacturingOrders.find((of) => of.supplierId === supplier.id)?.code ?? null,
            saleCode: order.sale?.code ?? null,
            clientName: order.client?.name ?? null,
            products: order.items
              .filter((item) => item.confirmedSupplierId === supplier.id)
              .map((item) => {
                const color = parseQuoteItemMeta(item.notes).color.trim();
                return `${item.product.name} ×${item.quantity}${color ? ` (${color})` : ""}`;
              }),
            orderType: order.type,
            orderStatus: order.status,
            paymentMethod: order.sale?.paymentMethod ?? null,
            hasSale: Boolean(order.sale),
          });
        }
        return { supplierId: supplier.id, name: supplier.displayName || supplier.name, entries, orders: infos };
      }),
    );
  }

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Proveedor actualizado"
        errorTitle="Error en proveedores"
      />

      {payables ? <SupplierPayablesSection payables={payables} currency={currency} /> : null}

      <SuppliersWorkspace
        currency={currency}
        suppliers={suppliers.map((supplier) => {
          const balance = summarizeSupplierDebt(
            supplier.ledgerEntries.map((entry) => ({ ...entry, amount: Number(entry.amount) })),
          ).balance;

          return {
            id: supplier.id,
            name: supplier.name,
            displayName: supplier.displayName,
            dispatchWarning: supplier.dispatchWarning,
            email: supplier.email,
            phone: supplier.phone,
            type: supplier.type,
            shareToken: supplier.shareToken,
            productsCount: supplier._count.products,
            balance,
          };
        })}
      />
    </section>
  );
}
