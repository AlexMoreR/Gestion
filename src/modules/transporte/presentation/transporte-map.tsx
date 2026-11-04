"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";
import mapa from "@/modules/transporte/data/colombia-mapa.json";
import type {
  CoverageMapCity,
  CoverageMapLocality,
} from "@/modules/transporte/domain/entities";
import {
  SHIPPING_MAP_COLORS,
  applyShippingTypeChange,
  countCitiesByType,
  localityDots,
} from "@/modules/transporte/domain/coverage-map";
import type { ShippingTypeName } from "@/modules/transporte/domain/shipping";
import { adminGetCoverageMapAction } from "@/app/actions/transporte-actions";
import {
  SHIPPING_LABELS,
  ShippingTypeControl,
  type PlaceKind,
} from "./shipping-type-control";

type Shapes = Record<string, string>;
type Points = Record<string, number[]>;

const MAIN_SHAPES = mapa.municipios as Shapes;
const MAIN_POINTS = mapa.centrosPoblados as Points;
const ISLAND = mapa.recuadroSanAndres;
const ISLAND_SHAPES = ISLAND.municipios as Shapes;
const ISLAND_POINTS = ISLAND.centrosPoblados as Points;
const SHAPE_CODES = new Set([
  ...Object.keys(MAIN_SHAPES),
  ...Object.keys(ISLAND_SHAPES),
]);
const TYPES: ShippingTypeName[] = [
  "GRATIS",
  "ADICIONAL",
  "COTIZAR",
  "NO_LLEGA",
];

// Recuadro de San Andres y Providencia, en el mar arriba a la izquierda del mapa principal.
const [, , ISLAND_W, ISLAND_H] = ISLAND.viewBox.split(" ").map(Number);
const ISLAND_BOX = { x: 8, y: 8, height: 150 };
const ISLAND_BOX_W = (ISLAND_W / ISLAND_H) * ISLAND_BOX.height;

type Selected = { kind: PlaceKind; id: string };

type TransporteMapProps = {
  // La misma funcion de guardar de la Lista; devuelve si salio bien.
  onSave: (
    kind: PlaceKind,
    id: string,
    shippingType: ShippingTypeName | null,
    wasFree: boolean,
    departmentName: string,
  ) => Promise<boolean>;
};

// Props de teclado/clic comunes a municipios y puntos.
function clickable(label: string, onSelect: () => void, className: string) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: onSelect,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    },
    className: `cursor-pointer outline-none hover:opacity-80 focus-visible:stroke-foreground ${className}`,
  };
}

export function TransporteMap({ onSave }: TransporteMapProps) {
  const [rows, setRows] = React.useState<{
    cities: CoverageMapCity[];
    localities: CoverageMapLocality[];
  } | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [selected, setSelected] = React.useState<Selected | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    adminGetCoverageMapAction()
      .then((data) => alive && setRows(data))
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  if (loadError) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudo cargar el mapa. Recarga la página o usa la Lista.
      </p>
    );
  }
  if (!rows) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando mapa...
      </p>
    );
  }
  if (rows.cities.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No hay municipios para mostrar.
      </p>
    );
  }

  const counts = countCitiesByType(rows.cities, SHAPE_CODES);
  const dots = localityDots(rows.localities, rows.cities);
  const cityById = new Map(rows.cities.map((city) => [city.id, city]));

  const selectedCity =
    selected?.kind === "city" ? cityById.get(selected.id) : undefined;
  const selectedLocality =
    selected?.kind === "locality"
      ? rows.localities.find((locality) => locality.id === selected.id)
      : undefined;
  const selectedParent = selectedLocality
    ? cityById.get(selectedLocality.cityId)
    : undefined;
  const selectedPlace = selectedCity ?? selectedLocality;

  async function save(next: ShippingTypeName | null) {
    if (!selected || !selectedPlace || !rows) return;
    setSaving(true);
    const departmentName =
      selectedCity?.departmentName ?? selectedParent?.departmentName ?? "";
    const ok = await onSave(
      selected.kind,
      selected.id,
      next,
      selectedPlace.effectiveShippingType === "GRATIS",
      departmentName,
    );
    setSaving(false);
    if (ok) {
      setRows((prev) =>
        prev
          ? applyShippingTypeChange(prev, selected.kind, selected.id, next)
          : prev,
      );
    }
  }

  function renderCities(shapes: Shapes) {
    return rows!.cities.map((city) => {
      const d = shapes[city.code];
      if (!d) return null;
      const label = `${city.name}, ${city.departmentName}: ${SHIPPING_LABELS[city.effectiveShippingType]}`;
      const isSelected = selected?.kind === "city" && selected.id === city.id;
      return (
        <path
          key={city.id}
          d={d}
          fill={SHIPPING_MAP_COLORS[city.effectiveShippingType]}
          strokeWidth={isSelected ? 1.5 : 0.3}
          {...clickable(
            label,
            () => setSelected({ kind: "city", id: city.id }),
            isSelected ? "stroke-foreground" : "stroke-card",
          )}
        >
          <title>{label}</title>
        </path>
      );
    });
  }

  function renderDots(points: Points, radius: number) {
    return dots.map((locality) => {
      const point = points[locality.code];
      if (!point) return null;
      const city = cityById.get(locality.cityId);
      const label = `${locality.name} (${city?.name ?? ""}): ${SHIPPING_LABELS[locality.effectiveShippingType]}`;
      return (
        <circle
          key={locality.id}
          cx={point[0]}
          cy={point[1]}
          r={radius}
          fill={SHIPPING_MAP_COLORS[locality.effectiveShippingType]}
          strokeWidth={radius / 4}
          {...clickable(
            label,
            () => setSelected({ kind: "locality", id: locality.id }),
            "stroke-foreground",
          )}
        >
          <title>{label}</title>
        </circle>
      );
    });
  }

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground">
        {TYPES.map((type) => (
          <li key={type} className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: SHIPPING_MAP_COLORS[type] }}
            />
            {SHIPPING_LABELS[type]}: <strong>{counts[type]}</strong>
          </li>
        ))}
        {counts.sinForma > 0 ? (
          <li className="text-muted-foreground">
            {counts.sinForma}{" "}
            {counts.sinForma === 1 ? "municipio" : "municipios"} sin forma en el
            mapa
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-muted-foreground">
        Toca un municipio o un punto (corregimiento con otro tipo) para cambiar
        su tipo de envío.
      </p>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        <svg
          viewBox={mapa.viewBox}
          className="mx-auto block h-auto max-h-[80vh] w-full"
          aria-label="Mapa de cobertura de envíos"
        >
          <g>{renderCities(MAIN_SHAPES)}</g>
          <g>{renderDots(MAIN_POINTS, 1.6)}</g>
          <rect
            x={ISLAND_BOX.x}
            y={ISLAND_BOX.y}
            width={ISLAND_BOX_W}
            height={ISLAND_BOX.height}
            fill="none"
            strokeWidth={0.6}
            className="stroke-border"
          />
          <svg
            x={ISLAND_BOX.x}
            y={ISLAND_BOX.y}
            width={ISLAND_BOX_W}
            height={ISLAND_BOX.height}
            viewBox={ISLAND.viewBox}
          >
            <g>{renderCities(ISLAND_SHAPES)}</g>
            <g>{renderDots(ISLAND_POINTS, 6)}</g>
          </svg>
          <text
            x={ISLAND_BOX.x + 3}
            y={ISLAND_BOX.y + ISLAND_BOX.height + 10}
            fontSize={8}
            className="fill-muted-foreground"
          >
            San Andrés y Providencia
          </text>
        </svg>

        {selectedPlace ? (
          <div className="absolute inset-x-2 top-2 ml-auto max-w-sm rounded-lg border border-border bg-background p-3 shadow-lg">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selectedPlace.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedCity
                    ? selectedCity.departmentName
                    : `${selectedParent?.name ?? ""}, ${selectedParent?.departmentName ?? ""}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ShippingTypeControl
              kind={selected!.kind}
              id={selected!.id}
              place={{ ...selectedPlace, cashOnDeliveryShipping: null }}
              pending={saving}
              onChange={save}
              withCashOnDelivery={false}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              El valor Contraentrega $ se cambia en la Lista.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
