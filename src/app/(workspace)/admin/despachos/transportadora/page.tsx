import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, MessageSquareText, ScrollText } from "lucide-react";
import type { DispatchStatus } from "@prisma/client";
import { auth } from "@/auth";
import { adminLogCarrierResponseAction, adminSetDispatchTrackingAction } from "@/app/actions/dispatch-actions";
import { CarrierMessageButton } from "@/components/admin/carrier-message-button";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { getDispatchStatusBadgeClassName, getDispatchStatusLabel } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

/*
  Seguimiento con la transportadora: que envios tiene cada proveedor de envios, cuales siguen
  sin guia, cuales estan en camino sin entregar y que respondio la transportadora la ultima vez
  que se la llamo. Solo lee Dispatch; la respuesta se guarda como linea fechada en Dispatch.notes
  y la guia en Dispatch.trackingNumber (acciones en dispatch-actions.ts).
*/

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 60;
const OPEN_STATUSES: DispatchStatus[] = ["PENDING", "PACKING", "SHIPPED"];
const RESPONSE_LINE = /^\[([^\]]+)\] Transportadora: (.*)$/;

// Pagina de servidor dinamica: se lee la hora una vez por pedido.
function currentTime() {
  return Date.now();
}

function daysSince(date: Date, now: number) {
  return Math.max(0, Math.floor((now - date.getTime()) / DAY_MS));
}

function lightClass(days: number) {
  if (days > 4) return "bg-rose-500/10 text-rose-700 dark:text-rose-400";
  if (days >= 2) return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

function lastCarrierResponse(notes: string | null) {
  const first = notes?.split("\n")[0]?.trim() ?? "";
  const match = first.match(RESPONSE_LINE);
  return match ? { stamp: match[1], text: match[2] } : null;
}

export default async function AdminDespachosTransportadoraPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "dispatches");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const now = currentTime();
  const since = new Date(now - HISTORY_DAYS * DAY_MS);

  const [dispatches, currency] = await Promise.all([
    prisma.dispatch.findMany({
      where: {
        deliveryType: "SHIPPING",
        OR: [{ status: { in: OPEN_STATUSES } }, { status: "DELIVERED", deliveredAt: { gte: since } }],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        status: true,
        carrierName: true,
        shippingCost: true,
        trackingNumber: true,
        notes: true,
        createdAt: true,
        packedAt: true,
        shippedAt: true,
        deliveredAt: true,
        carrierSupplier: { select: { name: true } },
        order: {
          select: { id: true, code: true, client: { select: { name: true, email: true, city: true } } },
        },
      },
      take: 500,
    }),
    getSystemCurrency(),
  ]);

  type Row = (typeof dispatches)[number] & { carrier: string; days: number; response: ReturnType<typeof lastCarrierResponse> };
  const rows: Row[] = dispatches.map((dispatch) => {
    const start = dispatch.shippedAt ?? dispatch.packedAt ?? dispatch.createdAt;
    return {
      ...dispatch,
      carrier: dispatch.carrierSupplier?.name || dispatch.carrierName?.trim() || "Sin transportadora",
      days: daysSince(dispatch.status === "DELIVERED" && dispatch.deliveredAt ? dispatch.deliveredAt : start, now),
      response: lastCarrierResponse(dispatch.notes),
    };
  });

  const isOpen = (row: Row) => OPEN_STATUSES.includes(row.status);
  const withoutTracking = rows.filter((row) => isOpen(row) && !row.trackingNumber?.trim());
  const inTransit = rows.filter((row) => row.status === "SHIPPED" && !!row.trackingNumber?.trim());
  const delivered = rows.filter((row) => row.status === "DELIVERED");

  const carriers = Array.from(new Set([...withoutTracking, ...inTransit].map((row) => row.carrier))).sort();

  const clientLabel = (row: Row) => {
    const client = row.order.client;
    const name = client?.name || client?.email || row.order.code;
    return client?.city ? `${name} (${client.city})` : name;
  };

  const carrierMessage = (carrier: string) => {
    const pendingGuide = withoutTracking.filter((row) => row.carrier === carrier);
    const pendingDelivery = inTransit.filter((row) => row.carrier === carrier);
    const lines = [`Hola, te escribo de Magilus por estos envíos:`];
    if (pendingGuide.length) {
      lines.push("", "SIN GUÍA:");
      pendingGuide.forEach((row) => lines.push(`- ${row.code} · ${clientLabel(row)} · hace ${row.days} día(s)`));
    }
    if (pendingDelivery.length) {
      lines.push("", "SIN ENTREGAR:");
      pendingDelivery.forEach((row) => lines.push(`- ${row.code} · guía ${row.trackingNumber} · hace ${row.days} día(s)`));
    }
    lines.push("", "¿Me confirmas las guías y cuándo se entregan? Gracias.");
    return lines.join("\n");
  };

  const renderRow = (row: Row, mode: "guide" | "transit" | "done") => (
    <div key={row.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card/95 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{row.code}</span>
          <Link href={`/admin/ordenes/${row.order.id}`} className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
            {row.order.code}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getDispatchStatusBadgeClassName(row.status)}`}>
            {getDispatchStatusLabel(row.status)}
          </span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${mode === "done" ? "bg-muted text-muted-foreground" : lightClass(row.days)}`}>
          {mode === "done" ? `Entregado hace ${row.days} d` : `${row.days} día(s)`}
        </span>
      </div>
      <p className="text-sm text-foreground">{clientLabel(row)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Guía: {row.trackingNumber?.trim() || "—"}</span>
        <span>Envío: {row.shippingCost === null ? "—" : formatMoney(Number(row.shippingCost), currency)}</span>
        {row.shippedAt ? <span>Despachado: {row.shippedAt.toLocaleDateString("es-CO")}</span> : null}
      </div>
      {row.response ? (
        <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-foreground">
          <MessageSquareText className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{row.response.stamp} · </span>
          {row.response.text}
        </p>
      ) : null}
      {mode !== "done" ? (
        <div className="grid gap-2 md:grid-cols-2">
          {mode === "guide" ? (
            <form action={adminSetDispatchTrackingAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="dispatchId" value={row.id} />
              <input
                name="trackingNumber"
                required
                placeholder="Número de guía"
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
              />
              <input name="trackingPhoto" type="file" accept="image/*" className="max-w-[11rem] text-xs" />
              <Button type="submit" size="sm" className="h-8">
                Guardar guía
              </Button>
            </form>
          ) : (
            <div />
          )}
          <form action={adminLogCarrierResponseAction} className="flex items-center gap-2">
            <input type="hidden" name="dispatchId" value={row.id} />
            <input
              name="response"
              required
              maxLength={500}
              placeholder="¿Qué respondió la transportadora?"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
            />
            <Button type="submit" variant="outline" size="sm" className="h-8">
              Guardar
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} okTitle="Seguimiento actualizado" errorTitle="Error" />
      <OperationsTabs />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Envíos con transportadora</h1>
          <p className="text-sm text-muted-foreground">
            Qué tiene cada transportadora, qué falta de guía y qué no se ha entregado. Semáforo: verde menos de 2 días, amarillo 2 a 4, rojo más de 4.
          </p>
        </div>
        <Link href="/admin/despachos" className="text-sm text-primary hover:underline">
          ← Despachos
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className={withoutTracking.length ? "border-rose-500/40 bg-rose-500/5" : "border-border bg-card/95"}>
          <CardContent className="space-y-1">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Sin guía</p>
            <p className="text-2xl font-semibold text-foreground">{withoutTracking.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-1">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Pendiente por entregar</p>
            <p className="text-2xl font-semibold text-foreground">{inTransit.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/95">
          <CardContent className="space-y-1">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Entregados ({HISTORY_DAYS} días)</p>
            <p className="text-2xl font-semibold text-foreground">{delivered.length}</p>
          </CardContent>
        </Card>
      </div>

      {carriers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No hay envíos abiertos con transportadora. Todo lo despachado ya tiene guía y fue entregado.
        </p>
      ) : null}

      {carriers.map((carrier) => {
        const guide = withoutTracking.filter((row) => row.carrier === carrier).sort((a, b) => b.days - a.days);
        const transit = inTransit.filter((row) => row.carrier === carrier).sort((a, b) => b.days - a.days);
        return (
          <div key={carrier} className="space-y-3 rounded-2xl border border-border bg-muted/20 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {carrier}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {guide.length} sin guía · {transit.length} por entregar
                </span>
              </h2>
              <CarrierMessageButton message={carrierMessage(carrier)} />
            </div>
            {guide.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Sin guía</h3>
                {guide.map((row) => renderRow(row, "guide"))}
              </div>
            ) : null}
            {transit.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Pendiente por entregar</h3>
                {transit.map((row) => renderRow(row, "transit"))}
              </div>
            ) : null}
          </div>
        );
      })}

      {delivered.length ? (
        <details className="rounded-2xl border border-border bg-card/95 p-3 sm:p-4">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
            <ScrollText className="h-4 w-4" />
            Entregados en los últimos {HISTORY_DAYS} días ({delivered.length})
          </summary>
          <div className="mt-3 space-y-2">
            {[...delivered].sort((a, b) => a.days - b.days).map((row) => renderRow(row, "done"))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
