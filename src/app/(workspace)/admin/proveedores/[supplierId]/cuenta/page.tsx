import { notFound, redirect } from "next/navigation";
import { Factory, Truck } from "lucide-react";
import { auth } from "@/auth";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { SupplierLedgerForm } from "@/components/admin/supplier-ledger-form";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminSupplierLedgerPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "suppliers");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const { supplierId } = await params;
  const query = await searchParams;
  const okMessage = typeof query.ok === "string" ? query.ok : "";
  const errorMessage = typeof query.error === "string" ? query.error : "";

  const [supplier, currency, accounts] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        name: true,
        displayName: true,
        type: true,
        ledgerEntries: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: { select: { name: true, email: true } },
            account: { select: { name: true } },
            order: { select: { id: true, code: true } },
          },
        },
      },
    }),
    getSystemCurrency(),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!supplier) {
    notFound();
  }

  const balance = supplier.ledgerEntries.reduce((acc, entry) => {
    const amount = Number(entry.amount);
    return entry.type === "CHARGE" ? acc + amount : acc - amount;
  }, 0);

  const ordersMap = new Map<string, { orderId: string; code: string; charged: number; paid: number }>();
  for (const entry of supplier.ledgerEntries) {
    if (!entry.order) continue;
    const current = ordersMap.get(entry.order.id) ?? {
      orderId: entry.order.id,
      code: entry.order.code,
      charged: 0,
      paid: 0,
    };
    const amount = Number(entry.amount);
    if (entry.type === "CHARGE") current.charged += amount;
    else current.paid += amount;
    ordersMap.set(entry.order.id, current);
  }
  const orders = Array.from(ordersMap.values())
    .map((order) => ({ orderId: order.orderId, code: order.code, pending: order.charged - order.paid }))
    .filter((order) => order.pending > 0.0001)
    .sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));

  const ledger = supplier.ledgerEntries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    amount: Number(entry.amount),
    note: entry.note,
    createdAt: (entry.paymentDate ?? entry.createdAt).toISOString(),
    createdByName: entry.createdBy.name ?? entry.createdBy.email,
    accountName: entry.account?.name ?? null,
    orderCode: entry.order?.code ?? null,
    receiptUrl: entry.receiptUrl ?? null,
  }));

  const returnTo = `/admin/proveedores/${supplier.id}/cuenta`;

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Cuenta actualizada"
        errorTitle="Error en la cuenta"
      />

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-slate-50 text-slate-700">
            {supplier.type === "SHIPPING" ? <Truck className="h-4 w-4" /> : <Factory className="h-4 w-4" />}
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Cuenta corriente</h1>
            <p className="text-sm text-muted-foreground">{supplier.displayName || supplier.name}</p>
          </div>
        </div>
      </div>

      <SupplierLedgerForm
        supplierId={supplier.id}
        balance={balance}
        orders={orders}
        ledger={ledger}
        accounts={accounts}
        currency={currency}
        returnTo={returnTo}
      />
    </section>
  );
}
