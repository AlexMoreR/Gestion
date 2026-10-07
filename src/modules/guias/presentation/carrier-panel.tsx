"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ShipmentIncident, ShipmentStatus } from "@prisma/client";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CloudRain,
  Loader2,
  MapPin,
  Package,
  Phone,
  ShieldAlert,
  TrafficCone,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  carrierReportAction,
  carrierSearchCitiesAction,
  type CarrierReportState,
} from "@/app/actions/shipment-public-actions";
import { cn } from "@/lib/utils";
import {
  CARRIER_INCIDENT_ACTIONS,
  CARRIER_STATUS_ACTIONS,
  SHIPMENT_FLOW,
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_LABEL,
} from "../domain/statuses";
import type { CityOption } from "../domain/types";
import { CityPicker } from "./city-picker";

type Selection = { kind: "STATUS"; status: ShipmentStatus } | { kind: "INCIDENT"; incident: ShipmentIncident };

type CarrierPanelProps = {
  token: string;
  status: ShipmentStatus;
  isClosed: boolean;
  suggestions: CityOption[];
  amountToCollectLabel: string | null; // "$150.000" o null si no hay cobro
};

const STATUS_ICON: Partial<Record<ShipmentStatus, LucideIcon>> = {
  PICKED_UP: Package,
  IN_TRANSIT: Truck,
  OUT_FOR_DELIVERY: MapPin,
  DELIVERED: CheckCircle2,
};

const INCIDENT_ICON: Partial<Record<ShipmentIncident, LucideIcon>> = {
  POLICE_INSPECTION: ShieldAlert,
  WEATHER: CloudRain,
  HEAVY_TRAFFIC: TrafficCone,
  OTHER: AlertTriangle,
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {pending ? "Guardando..." : label}
    </button>
  );
}

export function CarrierPanel({ token, status, isClosed, suggestions, amountToCollectLabel }: CarrierPanelProps) {
  const [selected, setSelected] = useState<Selection | null>(null);

  const [state, formAction] = useActionState<CarrierReportState, FormData>(async (prev, formData) => {
    const result = await carrierReportAction(prev, formData);
    if (result.status === "ok") {
      setSelected(null);
    }
    return result;
  }, { status: "idle" });

  const search = (term: string) => carrierSearchCitiesAction(token, term);
  const currentIndex = SHIPMENT_FLOW.indexOf(status);
  const nextStatuses = CARRIER_STATUS_ACTIONS.filter((value) => SHIPMENT_FLOW.indexOf(value) > currentIndex);
  const delivering = selected?.kind === "STATUS" && selected.status === "DELIVERED";
  const selectedLabel = selected
    ? selected.kind === "STATUS"
      ? SHIPMENT_STATUS_LABEL[selected.status]
      : SHIPMENT_INCIDENT_LABEL[selected.incident]
    : "";

  return (
    <div className="space-y-4">
      {state.status === "ok" ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-base font-semibold text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {state.message}
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-4 text-base font-medium text-rose-800">
          <AlertTriangle className="h-5 w-5 shrink-0" /> {state.error}
        </div>
      ) : null}

      {isClosed ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-base text-slate-700">
          Esta guía ya está cerrada. Gracias.
        </p>
      ) : selected ? (
        <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="kind" value={selected.kind} />
          {selected.kind === "STATUS" ? <input type="hidden" name="status" value={selected.status} /> : null}
          {selected.kind === "INCIDENT" ? <input type="hidden" name="incident" value={selected.incident} /> : null}

          <div className="flex items-center justify-between">
            <p className="text-lg font-bold text-slate-900">{selectedLabel}</p>
            <button type="button" onClick={() => setSelected(null)} className="text-sm font-medium text-slate-500 underline">
              Cancelar
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">¿En qué ciudad estás?</p>
            <CityPicker name="cityId" search={search} suggestions={suggestions} size="lg" placeholder="Escribe la ciudad" />
          </div>

          {delivering ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Foto del pedido entregado (obligatoria)</p>
                <label className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-base font-medium text-slate-700">
                  <Camera className="h-5 w-5" />
                  <input
                    type="file"
                    name="photo"
                    accept="image/*"
                    capture="environment"
                    required
                    className="w-full max-w-[14rem] text-sm"
                  />
                </label>
                <p className="text-xs text-slate-500">Toma la foto del paquete entregado, sin la cara de la persona.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Nombre de quien recibió</p>
                <input
                  name="receivedByName"
                  required
                  maxLength={120}
                  className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
                  placeholder="Nombre y apellido"
                />
              </div>
              {amountToCollectLabel ? (
                <label className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base font-semibold text-amber-900">
                  <input type="checkbox" name="collected" required className="h-6 w-6" />
                  Recibí {amountToCollectLabel} del cliente
                </label>
              ) : null}
            </>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              {selected.kind === "INCIDENT" && selected.incident === "OTHER" ? "¿Qué pasó? (obligatorio)" : "Nota (opcional)"}
            </p>
            <textarea
              name="note"
              maxLength={280}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
              placeholder="Escribe algo corto"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Tu nombre (opcional)</p>
            <input name="driverName" maxLength={120} className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base" />
          </div>

          {!delivering ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">Foto (opcional)</p>
              <input type="file" name="photo" accept="image/*" capture="environment" className="w-full text-sm" />
            </div>
          ) : null}

          <SubmitButton label={`Guardar: ${selectedLabel}`} />
        </form>
      ) : (
        <>
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Marcar etapa</p>
            {nextStatuses.map((value) => {
              const Icon = STATUS_ICON[value] ?? Truck;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelected({ kind: "STATUS", status: value })}
                  className={cn(
                    "flex h-14 w-full items-center gap-3 rounded-xl px-4 text-lg font-semibold",
                    value === "DELIVERED" ? "bg-emerald-600 text-white" : "bg-slate-900 text-white",
                  )}
                >
                  <Icon className="h-6 w-6" />
                  {SHIPMENT_STATUS_LABEL[value]}
                </button>
              );
            })}
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Reportar novedad</p>
            <div className="grid grid-cols-2 gap-3">
              {CARRIER_INCIDENT_ACTIONS.map((value) => {
                const Icon = INCIDENT_ICON[value] ?? AlertTriangle;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelected({ kind: "INCIDENT", incident: value })}
                    className="flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-2 text-base font-semibold text-amber-900"
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {value === "OTHER" ? "Otra novedad" : SHIPMENT_INCIDENT_LABEL[value]}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function CallButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-white text-lg font-semibold text-slate-900"
    >
      <Phone className="h-5 w-5" /> Llamar al cliente
    </a>
  );
}
