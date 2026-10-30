import Link from "next/link";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { auth } from "@/auth";
import { adminAssignFreightAccountAction, adminLinkFreightPaymentAction } from "@/app/actions/balances-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";
import { matchFreightPayments } from "@/modules/balances/domain/freight-without-account";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-64 dark:bg-input/30";

const dateLabel = (value: Date) => value.toLocaleDateString("es-CO", { timeZone: "America/Bogota" });

// Fletes viejos que quedaron sin cuenta (antes de exigir el pago al despachar). La persona les
// asigna la cuenta o los enlaza con el pago que ya hizo en Proveedores; nada se asigna solo.
export default async function FreightWithoutAccountPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !(await hasAdminModuleAccess(session.user.id, session.user.role, "balances"))) {
    redirect("/unauthorized");
  }

  const query = await searchParams;
  const okMessage = typeof query.ok === "string" ? query.ok : "";
  const errorMessage = typeof query.error === "string" ? query.error : "";

  const [currency, accounts, freights] = await Promise.all([
    getSystemCurrency(),
    prisma.account.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.shippingCost.findMany({
      where: { accountId: null, supplierPaymentId: null },
      orderBy: { paymentDate: "asc" },
      take: 300,
      select: {
        id: true,
        saleId: true,
        amount: true,
        paymentDate: true,
        shippingProvider: true,
        transactionReference: true,
        sale: { select: { code: true, client: { select: { name: true } }, order: { select: { id: true, code: true } } } },
      },
    }),
  ]);

  const saleIds = [...new Set(freights.map((row) => row.saleId))];
  const payments = saleIds.length
    ? await prisma.supplierLedgerEntry.findMany({
        where: {
          type: "PAYMENT",
          accountId: { not: null },
          shippingCosts: { none: {} },
          OR: [{ saleId: { in: saleIds } }, { order: { saleId: { in: saleIds } } }],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          saleId: true,
          amount: true,
          paymentDate: true,
          createdAt: true,
          receiptUrl: true,
          order: { select: { saleId: true } },
          supplier: { select: { name: true } },
          account: { select: { name: true } },
        },
      })
    : [];
  const candidates = payments.map((payment) => ({
    id: payment.id,
    saleId: payment.saleId ?? payment.order?.saleId ?? null,
    supplierName: payment.supplier.name,
    amount: Number(payment.amount),
    date: payment.paymentDate ?? payment.createdAt,
    accountName: payment.account?.name ?? "",
    receiptUrl: payment.receiptUrl,
  }));
  const total = freights.reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-primary">
          <Truck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Fletes sin cuenta</h1>
          <p className="text-sm text-muted-foreground">
            {freights.length} flete(s) por {formatMoney(total, currency)} que no restan de ningún saldo.
          </p>
        </div>
        <Link href="/admin/balances" className="ml-auto text-sm text-primary hover:underline">
          Volver a Balances
        </Link>
      </div>

      {freights.length === 0 ? (
        <Card className="border-border bg-card/95">
          <CardContent className="text-sm text-muted-foreground">
            Todos los fletes tienen cuenta o están enlazados con su pago. Nada pendiente.
          </CardContent>
        </Card>
      ) : (
        <form action={adminAssignFreightAccountAction} className="space-y-3">
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <p>
              Si el flete ya se pagó en Proveedores, usa <span className="font-semibold">“Ya está pagado en Proveedores”</span>{" "}
              al lado del pago: así no se resta dos veces. Si no, marca el flete y asígnale la cuenta de donde salió la plata.
            </p>
          </div>

          <ul className="space-y-2">
            {freights.map((row) => {
              const matches = matchFreightPayments(row, candidates);
              return (
                <li key={row.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      name="shippingCostIds"
                      value={row.id}
                      className="mt-1 h-4 w-4 shrink-0 accent-primary"
                      aria-label={`Marcar flete de ${row.shippingProvider} de la venta ${row.sale.code}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium text-foreground">{row.shippingProvider}</span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatMoney(Number(row.amount), currency)}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {dateLabel(row.paymentDate)} · {row.sale.code}
                        {row.sale.order ? ` · ${row.sale.order.code}` : ""}
                        {row.sale.client?.name ? ` · ${row.sale.client.name}` : ""}
                      </span>
                      {row.transactionReference ? (
                        <span className="block truncate text-xs text-muted-foreground">Ref. {row.transactionReference}</span>
                      ) : null}
                    </span>
                  </label>
                  {row.sale.order ? (
                    <Link href={`/admin/ordenes/${row.sale.order.id}`} className="ml-7 text-xs text-primary hover:underline">
                      Ver orden
                    </Link>
                  ) : null}

                  {matches.length > 0 ? (
                    <div className="ml-7 space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Pagos en Proveedores que podrían ser este flete:</p>
                      {matches.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
                        >
                          <span className="min-w-0">
                            {formatMoney(payment.amount, currency)} · {dateLabel(payment.date)} · desde {payment.accountName}
                            {payment.receiptUrl ? (
                              <>
                                {" · "}
                                <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                  ver comprobante
                                </a>
                              </>
                            ) : null}
                          </span>
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            formAction={adminLinkFreightPaymentAction}
                            name="link"
                            value={`${row.id}|${payment.id}`}
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

          <div className="sticky bottom-0 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
            <label htmlFor="freight-account" className="text-sm font-medium text-foreground">
              Cuenta de donde salió la plata
            </label>
            <select id="freight-account" name="accountId" defaultValue="" className={SELECT_CLASS}>
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
        </form>
      )}
    </section>
  );
}
