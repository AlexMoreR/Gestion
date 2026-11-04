"use client";

import * as React from "react";
import { AlertCircle, Loader2, Truck } from "lucide-react";
import {
  parseShippingExtraInput,
  type ShippingTypeName,
} from "@/modules/transporte/domain/shipping";
import { adminSetPlaceCashOnDeliveryAction } from "@/app/actions/transporte-actions";

export type PlaceKind = "city" | "locality";

// Campos de envio que comparten ciudades, corregimientos, resultados y pendientes.
export type ShippingFields = {
  freeShipping?: boolean;
  shippingType: ShippingTypeName | null;
  effectiveShippingType: ShippingTypeName;
  cashOnDeliveryShipping: number | null;
  needsReview?: boolean;
};

export const SHIPPING_LABELS: Record<ShippingTypeName, string> = {
  GRATIS: "Gratis",
  ADICIONAL: "Adicional",
  COTIZAR: "Se cotiza",
  NO_LLEGA: "No llegamos",
};

export const SHIPPING_TONES: Record<ShippingTypeName, string> = {
  GRATIS: "border-emerald-300 bg-emerald-50 text-emerald-700",
  ADICIONAL: "border-sky-300 bg-sky-50 text-sky-700",
  COTIZAR: "border-border bg-muted/40 text-muted-foreground",
  NO_LLEGA: "border-rose-300 bg-rose-50 text-rose-700",
};

const AUTO_VALUE = "AUTO";

const formatCop = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

// "Valor envio contraentrega" (solo combo de camillas). Se guarda al salir de la caja; vacio = se
// cotiza (un corregimiento vacio usa el de su ciudad).
function CashOnDeliveryInput({
  kind,
  id,
  value,
}: {
  kind: PlaceKind;
  id: string;
  value: number | null;
}) {
  const [saved, setSaved] = React.useState(value);
  const [draft, setDraft] = React.useState(
    value == null ? "" : formatCop(value),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSaved(value);
    setDraft(value == null ? "" : formatCop(value));
  }, [value]);

  async function save() {
    const next = parseShippingExtraInput(draft);
    if (next === undefined) {
      setError("Valor no válido");
      return;
    }
    setError(null);
    if (next === saved) {
      setDraft(next == null ? "" : formatCop(next));
      return;
    }
    setSaving(true);
    const result = await adminSetPlaceCashOnDeliveryAction(kind, id, draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo guardar el cambio");
      return;
    }
    const stored = result.value ?? null;
    setSaved(stored);
    setDraft(stored == null ? "" : formatCop(stored));
  }

  return (
    <label className="flex flex-wrap items-center justify-end gap-1.5 text-xs text-muted-foreground">
      <span className="whitespace-nowrap">Contraentrega $</span>
      <span className="relative">
        <input
          value={draft}
          inputMode="numeric"
          disabled={saving}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          placeholder={kind === "locality" ? "Como la ciudad" : "Se cotiza"}
          aria-label="Valor envío contraentrega"
          aria-invalid={error ? true : undefined}
          title="Solo para el combo de camillas con contraentrega. Vacío = se cotiza."
          className={`h-8 w-32 rounded-md border bg-background px-2 text-xs text-foreground disabled:opacity-60 ${
            error ? "border-destructive" : "border-border"
          }`}
        />
        {saving ? (
          <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </span>
      {error ? <span className="text-destructive">{error}</span> : null}
    </label>
  );
}

// Selector de tipo de envio + etiqueta con el tipo que aplica de verdad + valor contraentrega.
export function ShippingTypeControl({
  kind,
  id,
  place,
  pending,
  onChange,
  withCashOnDelivery = true,
}: {
  kind: PlaceKind;
  id: string;
  place: ShippingFields;
  pending: boolean;
  onChange: (next: ShippingTypeName | null) => void;
  // El mapa no trae el valor contraentrega: ahi se oculta para no pisarlo.
  withCashOnDelivery?: boolean;
}) {
  const effective = place.effectiveShippingType;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {effective === "NO_LLEGA" || !withCashOnDelivery ? null : (
        <CashOnDeliveryInput
          kind={kind}
          id={id}
          value={place.cashOnDeliveryShipping}
        />
      )}
      {place.needsReview ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          <AlertCircle className="h-3 w-3" /> Por revisar
        </span>
      ) : null}
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SHIPPING_TONES[effective]}`}
        title={
          place.shippingType
            ? "Tipo definido para esta ubicacion"
            : "Tipo automatico (heredado o como antes)"
        }
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Truck className="h-3 w-3" />
        )}
        {SHIPPING_LABELS[effective]}
        {place.shippingType ? "" : " (auto)"}
      </span>
      <select
        value={place.shippingType ?? AUTO_VALUE}
        disabled={pending}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === AUTO_VALUE ? null : (value as ShippingTypeName));
        }}
        aria-label="Tipo de envio"
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-60"
      >
        <option value={AUTO_VALUE}>Automatico (como antes)</option>
        <option value="GRATIS">Gratis</option>
        <option value="ADICIONAL">Adicional</option>
        <option value="COTIZAR">Se cotiza</option>
        <option value="NO_LLEGA">No llegamos</option>
      </select>
    </div>
  );
}
