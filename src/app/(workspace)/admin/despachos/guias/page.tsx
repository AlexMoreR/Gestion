import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, PackageSearch } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";
import {
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_BADGE,
  SHIPMENT_STATUS_LABEL,
} from "@/modules/guias/domain/statuses";

// Lista de guias Magilus: activas, con novedad y entregadas.

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const FILTERS = [
  { key: "activas", label: "Activas" },
  { key: "novedad", label: "Con novedad" },
  { key: "entregadas", label: "Entregadas" },
  { key: "todas", label: "Todas" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const DAY_MS = 86_400_000;

// Pagina de servidor dinamica: se lee la hora una vez por pedido.
function currentTime() {
  return Date.now();
}

function formatDay(date: Date | null): string {
  return date ? date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" }) : "—";
}

export default async function AdminGuiasPage({ searchParams }: PageProps) {
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
  const filter: FilterKey = FILTERS.some((item) => item.key === params.f) ? (params.f as FilterKey) : "activas";

  const where: Prisma.ShipmentWhereInput =
    filter === "entregadas"
      ? { status: "DELIVERED" }
      : filter === "todas"
        ? {}
        : { status: { notIn: ["DELIVERED", "CANCELLED", "RETURNED"] } };

  const [shipments, currency] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true,
        code: true,
        status: true,
        createdAt: true,
        estimatedDelivery: true,
        amountToCollect: true,
        collectOnDelivery: true,
        destinationCity: { select: { name: true } },
        currentCity: { select: { name: true } },
        dispatch: {
          select: {
            code: true,
            trackingNumber: true,
            carrierName: true,
            order: { select: { id: true, code: true, client: { select: { name: true, email: true } } } },
          },
        },
        events: {
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { kind: true, incident: true, occurredAt: true },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  const rows = filter === "novedad" ? shipments.filter((item) => item.events[0]?.kind === "INCIDENT") : shipments;
  const now = currentTime();

  return (
    <section className="w-full min-w-0 space-y-4">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} okTitle="Guías" errorTitle="Error" />
      <OperationsTabs />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Guías Magilus</h1>
          <p className="text-sm text-muted-foreground">
            Seguimiento propio del envío. El cliente lo consulta en magilus.com/guia con la guía MG y los últimos 4
            dígitos de su celular.
          </p>
        </div>
        {/* En celular el filtro ocupa todo el ancho y se desplaza si no cabe; nunca parte palabras. */}
        <div className="flex w-full max-w-full overflow-x-auto rounded-lg border border-border p-0.5 [scrollbar-width:none] sm:inline-flex sm:w-auto [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((item) => (
            <Link
              key={item.key}
              href={`/admin/despachos/guias?f=${item.key}`}
              className={`flex-1 shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-center text-xs font-medium sm:flex-none sm:px-3 sm:text-sm ${
                filter === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <PackageSearch className="h-4 w-4" />
            No hay guías en esta vista. Se crean al despachar con transportadora (check &quot;Crear guía Magilus&quot;) o
            desde la orden.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const client = row.dispatch.order.client;
            const last = row.events[0];
            const days = Math.max(0, Math.floor((now - row.createdAt.getTime()) / DAY_MS));
            return (
              <Link
                key={row.id}
                href={`/admin/despachos/guias/${row.id}`}
                className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border bg-card/95 p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-all font-semibold text-foreground">{row.code}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SHIPMENT_STATUS_BADGE[row.status]}`}>
                      {SHIPMENT_STATUS_LABEL[row.status]}
                    </span>
                    {last?.kind === "INCIDENT" && last.incident ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {SHIPMENT_INCIDENT_LABEL[last.incident]}
                      </span>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {row.dispatch.order.code} · {row.dispatch.code}
                    <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
                <p className="break-words text-sm text-foreground">
                  {client?.name || client?.email || "Cliente"} → {row.destinationCity?.name ?? "Destino sin definir"}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Va en: {row.currentCity?.name ?? "—"}</span>
                  <span>Estimada: {formatDay(row.estimatedDelivery)}</span>
                  <span>Hace {days} día(s)</span>
                  <span>
                    Cobro al recibir:{" "}
                    {row.collectOnDelivery ? formatMoney(Number(row.amountToCollect), currency) : "Nada"}
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    Proveedor (interno): {row.dispatch.carrierName ?? "—"} · guía {row.dispatch.trackingNumber?.trim() || "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
