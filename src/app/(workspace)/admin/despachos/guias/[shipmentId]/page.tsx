import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarDays, Link2, Lock, MapPin, Truck } from "lucide-react";
import { auth } from "@/auth";
import {
  adminAddShipmentEventAction,
  adminRegenerateCarrierTokenAction,
  adminSearchShipmentCitiesAction,
  adminSetCarrierLinkActiveAction,
  adminUpdateShipmentCollectAction,
  adminUpdateShipmentDestinationAction,
  adminUpdateShipmentEtaAction,
  adminUpdateShipmentWeightAction,
} from "@/app/actions/shipment-actions";
import { OperationsTabs } from "@/components/admin/operations-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl, getSiteUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";
import { toDateInputValue } from "@/modules/guias/domain/eta";
import { firstName, maskPhone } from "@/modules/guias/domain/lookup";
import {
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_BADGE,
  SHIPMENT_STATUS_LABEL,
} from "@/modules/guias/domain/statuses";
import type { CityOption } from "@/modules/guias/domain/types";
import { formatWeightKg } from "@/modules/guias/domain/weight";
import { AdminEventForm } from "@/modules/guias/presentation/admin-event-form";
import { CityPicker } from "@/modules/guias/presentation/city-picker";
import { CopyButton } from "@/modules/guias/presentation/copy-button";

type PageProps = {
  params: Promise<{ shipmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const cityInclude = { select: { id: true, name: true, code: true, department: { select: { name: true } } } } as const;

function toOption(city: { id: string; name: string; code: string; department: { name: string } } | null): CityOption | null {
  return city ? { id: city.id, name: city.name, code: city.code, departmentName: city.department.name } : null;
}

function formatStamp(date: Date): string {
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(date: Date | null): string {
  return date
    ? date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    : "Sin fecha";
}

const ACTOR_LABEL = { MAGILUS: "Magilus", CARRIER: "Transportador", SYSTEM: "Sistema" } as const;

export default async function AdminGuiaDetailPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "dispatches");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const [{ shipmentId }, query] = await Promise.all([params, searchParams]);
  const okMessage = typeof query.ok === "string" ? query.ok : "";
  const errorMessage = typeof query.error === "string" ? query.error : "";

  const [shipment, currency] = await Promise.all([
    prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        destinationCity: cityInclude,
        currentCity: cityInclude,
        originCity: cityInclude,
        createdBy: { select: { name: true, email: true } },
        dispatch: {
          select: {
            id: true,
            code: true,
            status: true,
            carrierName: true,
            trackingNumber: true,
            trackingPhotoUrl: true,
            shippingAddress: true,
            order: {
              select: { id: true, code: true, client: { select: { name: true, email: true, phone: true } } },
            },
          },
        },
        events: {
          orderBy: { occurredAt: "desc" },
          include: { city: { select: { name: true } }, actorUser: { select: { name: true, email: true } } },
        },
      },
    }),
    getSystemCurrency(),
  ]);
  if (!shipment) {
    notFound();
  }

  const client = shipment.dispatch.order.client;
  const clientName = client?.name || client?.email || "Cliente";
  const carrierUrl = getSiteUrl(`/envios/t/${shipment.carrierToken}`);
  const publicUrl = getSiteUrl("/guia");
  const amount = Number(shipment.amountToCollect);
  const weightKg = shipment.weightKg == null ? null : Number(shipment.weightKg);
  const destination = toOption(shipment.destinationCity);
  const current = toOption(shipment.currentCity);
  const suggestions = [current, destination].filter((city): city is CityOption => Boolean(city));

  const carrierMessage = [
    `Hola, este es el enlace de la guía ${shipment.code} de Magilus${destination ? ` (destino ${destination.name})` : ""}.`,
    "Ábrelo en el celular y marca cada etapa: recogido, en ruta, en reparto y entregado (con foto).",
    carrierUrl,
  ].join("\n");
  const clientMessage = [
    `Hola ${firstName(clientName)}, tu guía Magilus es *${shipment.code}*.`,
    `Consulta cómo va tu pedido en ${publicUrl} con la guía y los últimos 4 dígitos de tu celular.`,
    shipment.estimatedDelivery ? `Entrega estimada: ${formatDay(shipment.estimatedDelivery)}.` : "",
    amount > 0 && shipment.collectOnDelivery ? `Al recibir pagas ${formatMoney(amount, currency)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <section className="w-full space-y-4">
      <QueryFeedbackToast okMessage={okMessage} errorMessage={errorMessage} okTitle="Guía actualizada" errorTitle="Error" />
      <OperationsTabs />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/admin/despachos/guias" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Guías
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{shipment.code}</h1>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SHIPMENT_STATUS_BADGE[shipment.status]}`}>
              {SHIPMENT_STATUS_LABEL[shipment.status]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {clientName} · {maskPhone(client?.phone)} ·{" "}
            <Link href={`/admin/ordenes/${shipment.dispatch.order.id}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
              {shipment.dispatch.order.code} / {shipment.dispatch.code}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </p>
        </div>
      </div>

      {!shipment.publicEnabled || !shipment.phoneLast4 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          El cliente no tiene celular registrado: la consulta pública de esta guía está apagada. Agrega el celular en la
          ficha del cliente y crea la guía de nuevo si la necesitas.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Destino</p>
            <p className="font-semibold text-foreground">{destination ? `${destination.name} · ${destination.departmentName}` : "Sin definir"}</p>
            <p className="text-xs text-muted-foreground">Sale de {shipment.originCity?.name ?? "Bogotá"}</p>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Va en</p>
            <p className="font-semibold text-foreground">{current?.name ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Entrega estimada</p>
            <p className="font-semibold capitalize text-foreground">{formatDay(shipment.estimatedDelivery)}</p>
            <p className="text-xs text-muted-foreground">{shipment.etaIsManual ? "Puesta a mano" : "Automática"}</p>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Paga al recibir</p>
            <p className={`font-semibold ${amount > 0 ? "text-rose-600" : "text-foreground"}`}>
              {shipment.collectOnDelivery && amount > 0 ? formatMoney(amount, currency) : "Nada"}
            </p>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Peso</p>
            <p className="font-semibold text-foreground">{formatWeightKg(weightKg) ?? "Sin peso"}</p>
            {weightKg == null ? <p className="text-xs text-muted-foreground">El cliente ve “Por confirmar”</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Línea de tiempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l border-border pl-5">
              {shipment.events.map((event) => {
                const title =
                  event.kind === "STATUS" && event.status
                    ? SHIPMENT_STATUS_LABEL[event.status]
                    : event.kind === "INCIDENT" && event.incident
                      ? `Novedad: ${SHIPMENT_INCIDENT_LABEL[event.incident]}`
                      : event.kind === "ETA_CHANGE"
                        ? `Nueva fecha estimada: ${formatDay(event.newEta)}`
                        : "Nota";
                const by =
                  event.actor === "MAGILUS" || event.actor === "SYSTEM"
                    ? event.actorUser?.name || event.actorUser?.email || ACTOR_LABEL[event.actor]
                    : event.actorLabel || ACTOR_LABEL.CARRIER;
                return (
                  <li key={event.id} className="relative">
                    <span
                      className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-background ${
                        event.kind === "INCIDENT" ? "bg-amber-500" : event.kind === "STATUS" ? "bg-primary" : "bg-muted-foreground"
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                      {!event.visibleToClient ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" /> Interno
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatStamp(event.occurredAt)}
                      {event.city ? ` · ${event.city.name}` : ""} · {ACTOR_LABEL[event.actor]}: {by}
                    </p>
                    {event.note ? <p className="mt-1 whitespace-pre-line text-sm text-foreground">{event.note}</p> : null}
                    {event.photoUrl ? (
                      <a href={getPublicAssetUrl(event.photoUrl)} target="_blank" rel="noreferrer" className="mt-1 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getPublicAssetUrl(event.photoUrl)}
                          alt="Foto del evento"
                          className="h-20 w-20 rounded-md border border-border object-cover"
                        />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {shipment.receivedByName ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Recibió: <span className="font-medium text-foreground">{shipment.receivedByName}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agregar evento</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminEventForm
                shipmentId={shipment.id}
                currentStatus={shipment.status}
                action={adminAddShipmentEventAction}
                searchCities={adminSearchShipmentCitiesAction}
                suggestions={suggestions}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" /> Enlaces
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                <p className="font-medium text-foreground">Transportador (sin cuenta)</p>
                <p className="break-all text-xs text-muted-foreground">
                  {shipment.carrierTokenActive ? carrierUrl : "Enlace desactivado"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={carrierUrl} label="Copiar enlace" toastText="Enlace del transportador copiado" />
                  <CopyButton value={carrierMessage} label="Copiar mensaje" toastText="Mensaje copiado" />
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(carrierMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                  >
                    Enviar por WhatsApp
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={adminRegenerateCarrierTokenAction}>
                    <input type="hidden" name="shipmentId" value={shipment.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Generar enlace nuevo
                    </Button>
                  </form>
                  <form action={adminSetCarrierLinkActiveAction}>
                    <input type="hidden" name="shipmentId" value={shipment.id} />
                    <input type="hidden" name="active" value={shipment.carrierTokenActive ? "0" : "1"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {shipment.carrierTokenActive ? "Desactivar enlace" : "Activar enlace"}
                    </Button>
                  </form>
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                <p className="font-medium text-foreground">Cliente</p>
                <p className="whitespace-pre-line rounded-lg bg-muted/60 p-2 text-xs text-foreground">{clientMessage}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={clientMessage} label="Copiar mensaje para el cliente" toastText="Mensaje copiado" />
                  <CopyButton value={publicUrl} label="Copiar enlace de consulta" toastText="Enlace copiado" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4" /> Fecha estimada y destino
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={adminUpdateShipmentEtaAction} className="space-y-2">
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <div className="flex gap-2">
                  <Input
                    type="date"
                    name="estimatedDelivery"
                    required
                    defaultValue={toDateInputValue(shipment.estimatedDelivery)}
                    className="h-8"
                  />
                  <Button type="submit" size="sm" className="h-8">
                    Cambiar
                  </Button>
                </div>
                <Input name="note" maxLength={280} placeholder="Motivo (ej. lluvias en la vía)" className="h-8" />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" name="visibleToClient" defaultChecked className="h-3.5 w-3.5" />
                  Avisar el cambio en la consulta del cliente
                </label>
              </form>
              <form action={adminUpdateShipmentDestinationAction} className="space-y-2 border-t border-border pt-3">
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <p className="flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Ciudad destino
                </p>
                <CityPicker name="cityId" search={adminSearchShipmentCitiesAction} defaultValue={destination} />
                <Button type="submit" size="sm" variant="outline">
                  Guardar destino
                </Button>
                {!shipment.etaIsManual ? (
                  <p className="text-xs text-muted-foreground">
                    La fecha se recalcula sola: Bogotá 3, capitales 5, municipios 7 días hábiles.
                  </p>
                ) : null}
              </form>
              <form action={adminUpdateShipmentCollectAction} className="space-y-2 border-t border-border pt-3">
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cobro al recibir (COP)</p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    name="amountToCollect"
                    min={0}
                    step={1000}
                    defaultValue={Math.round(amount)}
                    className="h-8"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-8">
                    Guardar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">0 = el cliente no paga nada al recibir.</p>
              </form>
              <form action={adminUpdateShipmentWeightAction} className="space-y-2 border-t border-border pt-3">
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Peso (kg)</p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    name="weightKg"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Ej. 12,5"
                    pattern="\s*\d+([.,]\d+)?\s*"
                    title="Solo el número en kg, con coma o punto (ej. 12,5)"
                    defaultValue={weightKg == null ? "" : String(weightKg).replace(".", ",")}
                    className="h-8"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-8">
                    Guardar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Vacío = sin peso (el cliente ve “Por confirmar”).</p>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4" /> Transportadora (interno)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Transportadora:</span> {shipment.dispatch.carrierName ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Guía del proveedor:</span>{" "}
                {shipment.dispatch.trackingNumber?.trim() || "Aún no la envían"}
              </p>
              {shipment.dispatch.trackingPhotoUrl ? (
                <a
                  href={getPublicAssetUrl(shipment.dispatch.trackingPhotoUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Ver foto de la guía del proveedor
                </a>
              ) : null}
              <p className="pt-1 text-xs text-muted-foreground">
                Esto no lo ve el cliente. Para registrar la guía del proveedor usa la pestaña Transportadora.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
