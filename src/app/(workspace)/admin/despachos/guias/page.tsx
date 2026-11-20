import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { ShipmentsTable, type ShipmentTableRow } from "@/components/admin/shipments-table";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { displayCode } from "@/lib/code-display";
import { prisma } from "@/lib/prisma";
import { colombiaDayKey } from "@/lib/colombia-time";
import {
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_BADGE,
  SHIPMENT_STATUS_LABEL,
} from "@/modules/guias/domain/statuses";
import { isPastEstimate } from "@/modules/guias/domain/eta";

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

// Pagina de servidor dinamica: se lee la hora una vez por pedido.
function currentTime() {
  return new Date();
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

  const shipments = await prisma.shipment.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: {
      id: true,
      code: true,
      status: true,
      estimatedDelivery: true,
      destinationCity: { select: { name: true } },
      currentCity: { select: { name: true } },
      dispatch: {
        select: {
          code: true,
          order: { select: { id: true, code: true, client: { select: { name: true, email: true } } } },
        },
      },
      events: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { kind: true, incident: true, occurredAt: true },
      },
    },
  });

  const rows = filter === "novedad" ? shipments.filter((item) => item.events[0]?.kind === "INCIDENT") : shipments;
  const now = currentTime();
  const tableRows: ShipmentTableRow[] = rows.map((row) => {
    const client = row.dispatch.order.client;
    const last = row.events[0];
    return {
      id: row.id,
      code: row.code,
      statusLabel: SHIPMENT_STATUS_LABEL[row.status],
      statusBadge: SHIPMENT_STATUS_BADGE[row.status],
      incidentLabel: last?.kind === "INCIDENT" && last.incident ? SHIPMENT_INCIDENT_LABEL[last.incident] : null,
      client: client?.name || client?.email || "Cliente",
      destination: row.destinationCity?.name ?? "Sin definir",
      currentCity: row.currentCity?.name ?? "—",
      // Se guarda a las 12:00 UTC: su dia de Colombia es el mismo dia escrito.
      estimated: row.estimatedDelivery ? colombiaDayKey(row.estimatedDelivery) : null,
      overdue: isPastEstimate(row.estimatedDelivery, row.status, now),
      orderId: row.dispatch.order.id,
      orderLabel: `${displayCode(row.dispatch.order.code)} · ${displayCode(row.dispatch.code)}`,
    };
  });

  return (
    <section className="w-full min-w-0 space-y-4">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} okTitle="Guías" errorTitle="Error" />
      <OperationsTabs />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Guías Magilus</h1>
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
        <ShipmentsTable rows={tableRows} />
      )}
    </section>
  );
}
