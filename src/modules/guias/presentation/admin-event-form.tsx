"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { ShipmentIncident, ShipmentStatus } from "@prisma/client";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ALL_SHIPMENT_INCIDENTS,
  ALL_SHIPMENT_STATUSES,
  SHIPMENT_FLOW,
  SHIPMENT_INCIDENT_LABEL,
  SHIPMENT_STATUS_LABEL,
} from "../domain/statuses";
import type { CityOption } from "../domain/types";
import { CityPicker } from "./city-picker";

type Kind = "STATUS" | "INCIDENT" | "NOTE";

type AdminEventFormProps = {
  shipmentId: string;
  currentStatus: ShipmentStatus;
  action: (formData: FormData) => Promise<void>;
  searchCities: (term: string) => Promise<CityOption[]>;
  suggestions: CityOption[];
};

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {pending ? "Guardando..." : "Agregar evento"}
    </Button>
  );
}

function nextStatus(current: ShipmentStatus): ShipmentStatus {
  const index = SHIPMENT_FLOW.indexOf(current);
  if (index < 0 || index >= SHIPMENT_FLOW.length - 1) {
    return current === "CREATED" ? "PICKED_UP" : current;
  }
  return SHIPMENT_FLOW[index + 1];
}

export function AdminEventForm({ shipmentId, currentStatus, action, searchCities, suggestions }: AdminEventFormProps) {
  const [kind, setKind] = useState<Kind>("STATUS");
  const [status, setStatus] = useState<ShipmentStatus>(nextStatus(currentStatus));
  const [incident, setIncident] = useState<ShipmentIncident>("WEATHER");
  const [visible, setVisible] = useState(true);

  const changeKind = (value: Kind) => {
    setKind(value);
    setVisible(value !== "NOTE");
  };

  const tabs: { value: Kind; label: string }[] = [
    { value: "STATUS", label: "Etapa" },
    { value: "INCIDENT", label: "Novedad" },
    { value: "NOTE", label: "Nota" },
  ];

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="inline-flex rounded-lg border border-border p-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => changeKind(tab.value)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium",
              kind === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {kind === "STATUS" ? (
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Etapa</label>
          <select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ShipmentStatus)}
            className={SELECT_CLASS}
          >
            {ALL_SHIPMENT_STATUSES.filter((value) => value !== "CREATED" || currentStatus !== "CREATED").map((value) => (
              <option key={value} value={value}>
                {SHIPMENT_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
          {SHIPMENT_FLOW.indexOf(status) >= 0 &&
          SHIPMENT_FLOW.indexOf(currentStatus) >= 0 &&
          SHIPMENT_FLOW.indexOf(status) < SHIPMENT_FLOW.indexOf(currentStatus) ? (
            <p className="text-xs text-amber-600">Vas a retroceder la etapa: escribe una nota con el motivo.</p>
          ) : null}
        </div>
      ) : null}

      {kind === "INCIDENT" ? (
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Novedad</label>
          <select
            name="incident"
            value={incident}
            onChange={(event) => setIncident(event.target.value as ShipmentIncident)}
            className={SELECT_CLASS}
          >
            {ALL_SHIPMENT_INCIDENTS.map((value) => (
              <option key={value} value={value}>
                {SHIPMENT_INCIDENT_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ciudad</label>
        <CityPicker name="cityId" search={searchCities} suggestions={suggestions} />
      </div>

      {kind === "STATUS" && status === "DELIVERED" ? (
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quién recibió</label>
          <Input name="receivedByName" placeholder="Nombre de quien recibió" maxLength={120} />
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Nota</label>
        <Textarea name="note" maxLength={280} placeholder={kind === "NOTE" ? "Nota" : "Opcional"} />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Foto (opcional)</label>
        <Input type="file" name="photo" accept="image/*" className="h-8 text-xs" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="visibleToClient"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
          className="h-4 w-4"
        />
        Visible para el cliente
      </label>

      <SubmitButton />
    </form>
  );
}
