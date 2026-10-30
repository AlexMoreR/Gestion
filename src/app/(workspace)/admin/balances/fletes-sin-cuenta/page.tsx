import Link from "next/link";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { auth } from "@/auth";
import { adminAssignFreightAccountAction, adminLinkFreightToSupplierPaymentAction } from "@/app/actions/balances-actions";
import { Button } from "@/components/ui/button";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";
import { matchFreightPayments } from "@/modules/balances/domain/unassigned-freight";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-64 dark:bg-input/30";

function formatDay(date: Date): string {
  return date.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric" });
}

// Fletes viejos sin cuenta: no restan de ningun saldo. Al lado de cada uno, los pagos de
// Proveedores que podrian ser ese mismo flete (para no restarlo dos veces).
export default async function AdminUnassignedFreightPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }
  if (!(await hasAdminModuleAccess(session.user.id, session.user.role, "balances"))) {
    redirect("/unauthorized");
  }

  const query = await searchParams;
  const okMessage = typeof query.ok === "string" ? query.ok : "";
  const errorMessage = typeof query.error === "string" ? query.error : "";

  const [currency, freights, accounts] = await Promise.all([
    getSystemCurrency(),
    prisma.shippingCost.findMany({
      where: { accountId: null, supplierPaymentId: null },
      select: {
        id: true,
        saleId: true,
        amount: true,
        shippingProvider: true,
        transactionReference: true,
        paymentDate: true,
        sale: { select: { code: true, client: { select: { name: true, email: true } }, order: { select: { id: true, code: true } } } },
      },
      orderBy: { paymentDate: "desc" },
    }),
    prisma.account.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const saleIds = [...new Set(freights.map((freight) => freight.saleId))];
  const payments =
    saleIds.length > 0
      ? await prisma.supplierLedgerEntry.findMany({
          where: { type: "PAYMENT", accountId: { not: null }, saleId: { in: saleIds }, shippingCosts: { none: {} } },
          select: {
            id: true,
            saleId: true,
            amount: true,
            paymentDate: true,
            createdAt: true,
            receiptUrl: true,
            account: { select: { name: true } },
            supplier: { select: { name: true, displayName: true } },
          },
        })
      : [];
  const candidates = matchFreightPayments(
    freights.map((freight) => ({ id: freight.id, saleId: freight.saleId, shippingProvider: freight.shippingProvider })),
    payments.map((payment) => ({
      ...payment,
      supplierName: payment.supplier.name,
      supplierDisplayName: payment.supplier.displayName,
    })),
  );
  const total = freights.reduce((sum, freight) => sum + Number(freight.amount), 0);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} okTitle="Listo" errorTitle="No se pudo guardar" />

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-primary">
          <Truck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Fletes sin cuenta</h1>
          <p className="text-sm text-muted-foreground">
            {freights.length === 0
              ? "No queda ningún flete sin cuenta."
              : `${freights.length} flete(s) por ${formatMoney(total, currency)} que no restan de ningún saldo.`}
          </p>
        </div>
        <Link href="/admin/balances" className="ml-auto text-sm text-muted-foreground hover:text-foreground hover:underline">
          Volver a Balances
        </Link>
      </div>

      {freights.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Todos los fletes tienen cuenta o están enlazados a su pago en Proveedores.
        </div>
      ) : (
        <form action={adminAssignFreightAccountAction} className="space-y-3">
          <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <p>
              Si el flete ya se pagó en Proveedores, usa <span className="font-semibold">Ya está pagado en Proveedores</span>:
              no cambia ningún saldo. Si le asignas cuenta a un flete que ya se pagó allá, se resta dos veces.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
            <label className="text-sm font-medium text-foreground" htmlFor="freight-account">
              Cuenta de donde salió la plata
            </label>
            <select id="freight-account" name="accountId" required defaultValue="" className={SELECT_CLASS}>
              <option value="" disabled>
                Elige la cuenta
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <Button type="submit" className="sm:ml-auto">
              Asignar cuenta a los marcados
            </Button>
          </div>

          <ul className="space-y-2">
            {freights.map((freight) => {
              const options = candidates.get(freight.id) ?? [];
              const client = freight.sale.client.name || freight.sale.client.email;
              return (
                <li key={freight.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      name="shippingCostIds"
                      value={freight.id}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                      aria-label={`Marcar flete ${freight.shippingProvider} de ${freight.sale.code}`}
                    />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium text-foreground">{freight.shippingProvider}</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatMoney(Number(freight.amount), currency)}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDay(freight.paymentDate)} · {freight.sale.code}
                        {freight.sale.order ? ` · ${freight.sale.order.code}` : ""} · {client}
                      </span>
                      {freight.transactionReference ? (
                        <span className="block break-words text-xs text-muted-foreground">Ref.: {freight.transactionReference}</span>
                      ) : null}
                    </span>
                  </label>

                  {freight.sale.order ? (
                    <Link
                      href={`/admin/ordenes/${freight.sale.order.id}`}
                      className="ml-7 inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Ver orden
                    </Link>
                  ) : null}

                  {options.length > 0 ? (
                    <div className="ml-7 space-y-1.5 rounded-lg bg-muted/40 p-2">
                      <p className="text-xs font-medium text-foreground">Posible pago en Proveedores:</p>
                      {options.map((payment) => (
                        <div key={payment.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 text-muted-foreground">
                            {formatMoney(Number(payment.amount), currency)} a {payment.supplierDisplayName || payment.supplierName}{" "}
                            desde {payment.account?.name} · {formatDay(payment.paymentDate ?? payment.createdAt)}
                            {payment.receiptUrl ? (
                              <>
                                {" · "}
                                <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                                  ver comprobante
                                </a>
                              </>
                            ) : null}
                          </span>
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            formAction={adminLinkFreightToSupplierPaymentAction}
                            formNoValidate
                            name="link"
                            value={`${freight.id}:${payment.id}`}
                          >
                            Ya está pagado en Proveedores
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </form>
      )}
    </section>
  );
}
