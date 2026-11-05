"use client";

import * as React from "react";
import { Loader2, Maximize, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import mapa from "@/modules/transporte/data/colombia-mapa.json";
import type {
  CoverageMapCity,
  CoverageMapLocality,
} from "@/modules/transporte/domain/entities";
import {
  SHIPPING_MAP_COLORS,
  applyShippingTypeChange,
  clampView,
  MAP_MAX_ZOOM,
  countCitiesByType,
  groupCitiesByDepartment,
  localityDots,
  zoomView,
  type MapView,
} from "@/modules/transporte/domain/coverage-map";
import type { ShippingTypeName } from "@/modules/transporte/domain/shipping";
import { isDepartmentCapitalCode } from "@/modules/transporte/domain/place-search";
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

const [FULL_X, FULL_Y, FULL_W, FULL_H] = mapa.viewBox.split(" ").map(Number);
const FULL_VIEW: MapView = { x: FULL_X, y: FULL_Y, w: FULL_W, h: FULL_H };
// Más de esto (en px de pantalla) entre bajar y soltar es arrastre, no toque.
const DRAG_PX = 5;

type Selected = { kind: PlaceKind; id: string };
// Caja y centro medidos de cada forma del mapa principal, por código DANE.
type ShapeBox = { bounds: MapView; cx: number; cy: number };
// Estilo de los rótulos: borde blanco detrás de la letra y sin tapar el clic.
const LABEL_STYLE: React.CSSProperties = {
  paintOrder: "stroke",
  stroke: "white",
  strokeLinejoin: "round",
  pointerEvents: "none",
};

// Punto de la pantalla (clientX/Y) en unidades del viewBox actual del SVG.
function toSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
}

type Gesture = {
  pointers: Map<number, { x: number; y: number }>;
  start: { x: number; y: number }; // donde bajó el primer dedo o el mouse
  startView: MapView; // vista al empezar el arrastre o el pellizco
  anchor: { x: number; y: number }; // pantalla al empezar (1 dedo) o punto medio en el SVG (2 dedos)
  startDist: number;
  moved: boolean;
};

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
  const [view, setView] = React.useState<MapView>(FULL_VIEW);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const gesture = React.useRef<Gesture | null>(null);
  const pathRefs = React.useRef(new Map<string, SVGPathElement>());
  const [boxes, setBoxes] = React.useState<Map<string, ShapeBox> | null>(null);
  // Píxeles de pantalla por unidad del mapa con la vista completa (cambia con el ancho del celular).
  const [pxFull, setPxFull] = React.useState(1);
  const loaded = rows !== null && rows.cities.length > 0;

  // Mide cada forma una sola vez, cuando ya están pintadas (el JSON no trae posiciones).
  React.useLayoutEffect(() => {
    if (!loaded || boxes) return;
    const measured = new Map<string, ShapeBox>();
    for (const [code, path] of pathRefs.current) {
      const b = path.getBBox();
      measured.set(code, {
        bounds: { x: b.x, y: b.y, w: b.width, h: b.height },
        cx: b.x + b.width / 2,
        cy: b.y + b.height / 2,
      });
    }
    setBoxes(measured);
  }, [loaded, boxes]);

  React.useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!loaded || !svg) return;
    const measure = () => {
      const ctm = svg.getScreenCTM();
      const box = svg.viewBox.baseVal;
      if (ctm && box.width > 0) setPxFull((ctm.a * box.width) / FULL_VIEW.w || 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [loaded]);

  // Rótulos fijos (no dependen del zoom): departamentos, capitales y demás municipios.
  const labels = React.useMemo(() => {
    if (!boxes || !rows) return null;
    const cityByCode = new Map(rows.cities.map((city) => [city.code, city]));
    const departments = groupCitiesByDepartment(
      [...boxes].map(([code, box]) => ({
        code,
        departmentName: cityByCode.get(code)?.departmentName,
        bounds: box.bounds,
      })),
    ).filter((group) => group.name && group.codes.length > 1); // Bogotá ya sale como capital
    const capitals: { code: string; name: string; x: number; y: number }[] = [];
    const others: typeof capitals = [];
    for (const [code, box] of boxes) {
      const city = cityByCode.get(code);
      if (!city) continue;
      (isDepartmentCapitalCode(code) ? capitals : others).push({
        code,
        name: city.name,
        x: box.cx,
        y: box.cy,
      });
    }
    return { departments, capitals, others };
  }, [boxes, rows]);

  // La rueda acerca o aleja hacia el puntero. passive:false para que no baje la página.
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!loaded || !svg) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const point = toSvgPoint(svg!, event.clientX, event.clientY);
      if (!point) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      setView((current) =>
        zoomView(
          current,
          Math.exp(-delta * 0.002),
          point.x,
          point.y,
          FULL_VIEW,
        ),
      );
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [loaded]);

  function startGesture(g: Gesture) {
    const svg = svgRef.current;
    const pts = [...g.pointers.values()];
    g.startView = view;
    if (pts.length >= 2 && svg) {
      const mid = toSvgPoint(
        svg,
        (pts[0].x + pts[1].x) / 2,
        (pts[0].y + pts[1].y) / 2,
      );
      g.anchor = mid ? { x: mid.x, y: mid.y } : { x: 0, y: 0 };
      g.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    } else if (pts.length === 1) {
      g.anchor = pts[0];
    }
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!gesture.current || gesture.current.pointers.size === 0) {
      gesture.current = {
        pointers: new Map(),
        start: point,
        startView: view,
        anchor: point,
        startDist: 1,
        moved: false,
      };
    }
    const g = gesture.current;
    g.pointers.set(event.pointerId, point);
    if (g.pointers.size >= 2) {
      // Pellizco: es gesto de zoom, no toque.
      g.moved = true;
      for (const id of g.pointers.keys()) {
        if (!event.currentTarget.hasPointerCapture(id)) {
          try {
            event.currentTarget.setPointerCapture(id);
          } catch {
            // el puntero ya se soltó
          }
        }
      }
    }
    startGesture(g);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || !g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const svg = event.currentTarget;
    const pts = [...g.pointers.values()];
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setView(
        zoomView(
          g.startView,
          dist / g.startDist,
          g.anchor.x,
          g.anchor.y,
          FULL_VIEW,
        ),
      );
      return;
    }
    if (!g.moved) {
      if (
        Math.hypot(event.clientX - g.start.x, event.clientY - g.start.y) <=
        DRAG_PX
      )
        return;
      // Ya es arrastre: se captura el puntero (antes no, para que el toque llegue al municipio).
      g.moved = true;
      svg.setPointerCapture(event.pointerId);
    }
    const scale = g.startView.w / (svg.getBoundingClientRect().width || 1);
    setView(
      clampView(
        {
          ...g.startView,
          x: g.startView.x - (event.clientX - g.anchor.x) * scale,
          y: g.startView.y - (event.clientY - g.anchor.y) * scale,
        },
        FULL_VIEW,
      ),
    );
  }

  function onPointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || !g.pointers.delete(event.pointerId)) return;
    // Si queda un dedo después del pellizco, sigue arrastrando desde donde está.
    startGesture(g);
  }

  // Las formas de los municipios no se recalculan al mover o acercar: solo cambia el viewBox.
  const cityPaths = React.useMemo(() => {
    const cities = rows?.cities ?? [];
    function renderCities(shapes: Shapes) {
      return cities.map((city) => {
        const d = shapes[city.code];
        if (!d) return null;
        const label = `${city.name}, ${city.departmentName}: ${SHIPPING_LABELS[city.effectiveShippingType]}`;
        const isSelected = selected?.kind === "city" && selected.id === city.id;
        return (
          <path
            key={city.id}
            ref={
              shapes === MAIN_SHAPES
                ? (el: SVGPathElement | null) => {
                    if (el) pathRefs.current.set(city.code, el);
                    else pathRefs.current.delete(city.code);
                  }
                : undefined
            }
            d={d}
            fill={SHIPPING_MAP_COLORS[city.effectiveShippingType]}
            strokeWidth={isSelected ? 1.5 : 0.3}
            vectorEffect="non-scaling-stroke"
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
    return {
      main: renderCities(MAIN_SHAPES),
      island: renderCities(ISLAND_SHAPES),
    };
  }, [rows, selected]);

  function zoomButton(factor: number) {
    setView((current) =>
      zoomView(
        current,
        factor,
        current.x + current.w / 2,
        current.y + current.h / 2,
        FULL_VIEW,
      ),
    );
  }

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
  // Los puntos guardan su tamaño en pantalla al acercar.
  const zoomScale = view.w / FULL_VIEW.w;
  // Rótulos en píxeles de pantalla: igual tamaño al acercar y legibles en el celular.
  const px = zoomScale / pxFull;

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
        su tipo de envío. Acerca con la rueda o con dos dedos y arrastra para
        moverte.
      </p>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="mx-auto block h-auto max-h-[80vh] w-full touch-none select-none"
          aria-label="Mapa de cobertura de envíos"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={(event) => {
            // Después de arrastrar o pellizcar, soltar no abre ningún panel.
            if (gesture.current?.moved) event.stopPropagation();
          }}
        >
          <g>{cityPaths?.main}</g>
          <g>{renderDots(MAIN_POINTS, 1.6 * zoomScale)}</g>
          {labels ? (
            <g
              style={LABEL_STYLE}
              aria-hidden="true"
              // Letra oscura con borde blanco: se lee igual en tema claro y oscuro.
              className="fill-neutral-900"
              textAnchor="middle"
            >
              {view.w < FULL_VIEW.w / 4
                ? labels.others
                    .filter(
                      (m) =>
                        m.x >= view.x &&
                        m.x <= view.x + view.w &&
                        m.y >= view.y &&
                        m.y <= view.y + view.h,
                    )
                    .map((m) => (
                      <text
                        key={m.code}
                        x={m.x}
                        y={m.y}
                        dominantBaseline="middle"
                        fontSize={10 * px}
                        strokeWidth={2.5 * px}
                      >
                        {m.name}
                      </text>
                    ))
                : null}
              {labels.departments.map((dep) => (
                <text
                  key={dep.name}
                  x={dep.center.x}
                  y={dep.center.y}
                  dominantBaseline="middle"
                  fontSize={12 * px}
                  fontWeight={700}
                  strokeWidth={3 * px}
                >
                  {dep.name}
                </text>
              ))}
              {labels.capitals.map((cap) => (
                <g key={cap.code}>
                  <circle
                    cx={cap.x}
                    cy={cap.y}
                    r={3 * px}
                    fill="black"
                    stroke="white"
                    strokeWidth={1 * px}
                  />
                  <text
                    x={cap.x + 5 * px}
                    y={cap.y}
                    textAnchor="start"
                    dominantBaseline="middle"
                    fontSize={11 * px}
                    strokeWidth={3 * px}
                  >
                    {cap.name}
                  </text>
                </g>
              ))}
            </g>
          ) : null}
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
            <g>{cityPaths?.island}</g>
            <g>{renderDots(ISLAND_POINTS, 6 * zoomScale)}</g>
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

        <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Acercar"
            title="Acercar"
            disabled={view.w <= FULL_VIEW.w / MAP_MAX_ZOOM + 1e-9}
            onClick={() => zoomButton(2)}
          >
            <Plus />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Alejar"
            title="Alejar"
            disabled={view.w >= FULL_VIEW.w}
            onClick={() => zoomButton(0.5)}
          >
            <Minus />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Ver toda Colombia"
            disabled={view.w >= FULL_VIEW.w}
            onClick={() => setView(FULL_VIEW)}
          >
            <Maximize />
            Ver toda Colombia
          </Button>
        </div>

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
