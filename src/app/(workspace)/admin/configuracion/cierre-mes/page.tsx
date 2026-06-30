import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { MonthClosureForm } from "@/components/admin/month-closure-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { resolveMonthPeriod } from "@/lib/month-period";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function countRecipients(raw: string): number {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export default async function AdminCierreMesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [currency, closures] = await Promise.all([
    getSystemCurrency(),
    prisma.monthClosure.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        periodLabel: true,
        netProfit: true,
        marginPct: true,
        recipients: true,
        createdAt: true,
        generatedBy: { select: { name: true, email: true } },
      },
    }),
  ]);

  const defaultMonth = resolveMonthPeriod().value;

  return (
    <section className="w-full space-y-6">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Cierre de mes"
        errorTitle="No se pudo generar el cierre"
      />

      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">Cierre de mes</h1>
        <p className="text-[13px] leading-5 text-muted-foreground">
          Genera el informe de ventas y ganancia de un mes y envialo por correo.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Generar cierre</CardTitle>
          <CardDescription>
            Elige el mes y los destinatarios. Las cifras quedan congeladas al momento de generar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthClosureForm defaultMonth={defaultMonth} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Cierres generados
        </h2>
        {closures.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Aun no has generado ningun cierre de mes.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <ul className="divide-y divide-border">
              {closures.map((closure) => (
                <li key={closure.id}>
                  <Link
                    href={`/admin/configuracion/cierre-mes/${closure.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,white)] text-[var(--primary)]">
                        <CalendarCheck className="h-4 w-4" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium capitalize text-foreground">{closure.periodLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {closure.createdAt.toLocaleDateString("es-CO")} ·{" "}
                          {countRecipients(closure.recipients)}{" "}
                          {countRecipients(closure.recipients) === 1 ? "destinatario" : "destinatarios"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(Number(closure.netProfit), currency)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
