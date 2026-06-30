import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";
import type { SupportedCurrencyCode } from "@/lib/currency";

type PageProps = {
  params: Promise<{ closureId: string }>;
};

function MetricCard({
  title,
  value,
  helper,
  accent = false,
}: {
  title: string;
  value: string;
  helper?: string;
  accent?: boolean;
}) {
  return (
    <Card className="border-border bg-card/95 py-2">
      <CardContent className="space-y-0.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <p
          className={`text-lg font-semibold ${
            accent ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
          }`}
        >
          {value}
        </p>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function AdminCierreMesReportPage({ params }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const { closureId } = await params;

  const [currency, closure] = await Promise.all([
    getSystemCurrency(),
    prisma.monthClosure.findUnique({
      where: { id: closureId },
      include: { generatedBy: { select: { name: true, email: true } } },
    }),
  ]);

  if (!closure) {
    notFound();
  }

  const money = (value: number) => formatMoney(value, currency as SupportedCurrencyCode);
  const directCosts = Number(closure.supplierCosts) + Number(closure.shippingCosts);

  let recipients: string[] = [];
  try {
    const parsed = JSON.parse(closure.recipients);
    if (Array.isArray(parsed)) recipients = parsed;
  } catch {
    recipients = [];
  }

  return (
    <section className="w-full space-y-5">
      <div className="space-y-1">
        <Link
          href="/admin/configuracion/cierre-mes"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a cierres
        </Link>
        <h1 className="text-xl font-semibold capitalize tracking-tight text-foreground">
          Cierre de {closure.periodLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          Generado el {closure.createdAt.toLocaleDateString("es-CO")} por{" "}
          {closure.generatedBy.name || closure.generatedBy.email}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Ventas del mes"
          value={money(Number(closure.salesTotal))}
          helper={`${closure.salesCount} ${closure.salesCount === 1 ? "venta" : "ventas"}`}
        />
        <MetricCard
          title="Costos directos"
          value={money(directCosts)}
          helper="Proveedores y envio"
        />
        <MetricCard
          title="Gastos operativos"
          value={money(Number(closure.operatingExpenses))}
          helper="Nomina, marketing y varios"
        />
        <MetricCard
          title="Ganancia neta"
          value={money(Number(closure.netProfit))}
          helper={`${Number(closure.marginPct).toFixed(2)}% de margen`}
          accent
        />
      </div>

      <Card className="border-border">
        <CardContent className="space-y-3 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Desglose
          </h2>
          <dl className="divide-y divide-border text-sm">
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Ventas totales</dt>
              <dd className="font-medium text-foreground">{money(Number(closure.salesTotal))}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Costo de proveedores</dt>
              <dd className="font-medium text-foreground">- {money(Number(closure.supplierCosts))}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Costo de envios</dt>
              <dd className="font-medium text-foreground">- {money(Number(closure.shippingCosts))}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Gastos operativos</dt>
              <dd className="font-medium text-foreground">- {money(Number(closure.operatingExpenses))}</dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="font-semibold text-foreground">Ganancia neta</dt>
              <dd className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {money(Number(closure.netProfit))}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {recipients.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Enviado a: {recipients.join(", ")}
        </p>
      ) : null}
    </section>
  );
}
