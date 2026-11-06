"use client";

import * as React from "react";
import { Building2, Loader2, Map as MapIcon, MapPin, Maximize, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import mapa from "@/modules/transporte/data/colombia-mapa.json";
import type {
  CoverageMapCity,
  CoverageMapLocality,
  TransportSearchResult,
} from "@/modules/transporte/domain/entities";
import {
  SHIPPING_MAP_COLORS,
  applyShippingTypeChange,
  clampView,
  MAP_MAX_ZOOM,
  countCitiesByType,
  fitBounds,
  groupCitiesByDepartment,
  localityDots,
  searchDepartments,
  searchMapCities,
  zoomView,
  type MapView,
} from "@/modules/transporte/domain/coverage-map";
import {
  normalizePlaceName,
  type ShippingTypeName,
} from "@/modules/transporte/domain/shipping";
import { isDepartmentCapitalCode } from "@/modules/transporte/domain/place-search";
import {
  adminGetCoverageMapAction,
  adminSearchTransportAction,
} from "@/app/actions/transporte-actions";
import {
  SHIPPING_LABELS,
  ShippingTypeControl,
  type PlaceKind,
} from "./shipping-type-control";
import { ROAD_STYLES, TransporteIslandRoads, TransporteRoads } from "./transporte-roads";

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
const ISLAND_RECT: MapView = {
  x: ISLAND_BOX.x,
  y: ISLAND_BOX.y,
  w: ISLAND_BOX_W,
  h: ISLAND_BOX.height,
};

const [FULL_X, FULL_Y, FULL_W, FULL_H] = mapa.viewBox.split(" ").map(Number);
const FULL_VIEW: MapView = { x: FULL_X, y: FULL_Y, w: FULL_W, h: FULL_H };
// Más de esto (en px de pantalla) entre bajar y soltar es arrastre, no toque.
const DRAG_PX = 5;
// Las vías menores salen al acercar: en la vista completa tapan los colores de envío.
const MINOR_ROADS_MAX_W = FULL_VIEW.w / 3;
const ROAD_LEGEND = [
  { level: "principales", label: "Carretera principal" },
  { level: "secundarias", label: "Carretera secundaria" },
  { level: "terciarias", label: "Otras carreteras (al acercar)" },
] as const;

// Departamento: id = su nombre.
type Selected = { kind: PlaceKind | "department"; id: string };
// Lo que marcó el buscador: bordes rojos de municipios (DANE) y, si es corregimiento, un anillo en su punto.
type Highlight = {
  codes: string[];
  point: { x: number; y: number; island: boolean } | null;
  key: number; // cambia en cada búsqueda para que el parpadeo vuelva a empezar
};
// Solo borde: el relleno rojo ya significa "No llegamos".
const HIGHLIGHT_STROKE = SHIPPING_MAP_COLORS.NO_LLEGA;
const BLINK_CSS = `@keyframes transporteMapaParpadeo{0%,100%{opacity:1}50%{opacity:.15}}
.transporte-mapa-marca{animation:transporteMapaParpadeo .75s ease-in-out 4}
@media (prefers-reduced-motion:reduce){.transporte-mapa-marca{animation:none}}`;
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
  const [highlight, setHighlight] = React.useState<Highlight | null>(null);
  const [query, setQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [localityResults, setLocalityResults] = React.useState<
    TransportSearchResult[]
  >([]);
  const [searching, setSearching] = React.useState(false);
  const [searchFailed, setSearchFailed] = React.useState(false);
  const loaded = rows !== null && rows.cities.length > 0;
  const searchReady = normalizePlaceName(query).length >= 2;

  // Corregimientos: se piden al servidor con una espera corta al teclear (la misma búsqueda de la Lista).
  React.useEffect(() => {
    const term = query.trim();
    if (normalizePlaceName(term).length < 2) {
      setLocalityResults([]);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const handle = setTimeout(() => {
      adminSearchTransportAction(term)
        .then((results) => {
          if (!alive) return;
          setLocalityResults(
            results.filter((r) => r.kind === "locality").slice(0, 8),
          );
          setSearchFailed(false);
        })
        .catch(() => alive && setSearchFailed(true))
        .finally(() => alive && setSearching(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query]);

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

  // Elegir a mano (toque o teclado) o cerrar el panel quita la marca roja del buscador.
  function pick(next: Selected | null) {
    setSelected(next);
    setHighlight(null);
  }

  // Caja de cada departamento del mapa principal (une las formas de sus municipios).
  const departmentGroups = React.useMemo(() => {
    if (!boxes || !rows) return [];
    const cityByCode = new Map(rows.cities.map((city) => [city.code, city]));
    return groupCitiesByDepartment(
      [...boxes].map(([code, box]) => ({
        code,
        departmentName: cityByCode.get(code)?.departmentName,
        bounds: box.bounds,
      })),
    );
  }, [boxes, rows]);

  // Rótulos fijos (no dependen del zoom): departamentos, capitales y demás municipios.
  const labels = React.useMemo(() => {
    if (!boxes || !rows) return null;
    const cityByCode = new Map(rows.cities.map((city) => [city.code, city]));
    const departments = departmentGroups.filter(
      (group) => group.name && group.codes.length > 1,
    ); // Bogotá ya sale como capital
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
  }, [boxes, rows, departmentGroups]);

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
              () => pick({ kind: "city", id: city.id }),
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

  const departmentNames = [
    ...new Set(rows.cities.map((city) => city.departmentName)),
  ];
  const departmentResults = searchReady
    ? searchDepartments(departmentNames, query)
    : [];
  const cityResults = searchReady ? searchMapCities(rows.cities, query) : [];

  // Caja donde se ve un municipio: su forma, el recuadro de la isla o, sin forma, su departamento.
  function cityBounds(city: CoverageMapCity): MapView | null {
    if (ISLAND_SHAPES[city.code]) return ISLAND_RECT;
    const box = boxes?.get(city.code);
    if (box) return box.bounds;
    return (
      departmentGroups.find((group) => group.name === city.departmentName)
        ?.bounds ?? null
    );
  }

  function departmentCodes(name: string) {
    return rows!.cities
      .filter((city) => city.departmentName === name)
      .map((city) => city.code);
  }

  function goTo(
    next: Selected,
    bounds: MapView | null,
    codes: string[],
    point: Highlight["point"] = null,
  ) {
    setSelected(next);
    setHighlight((prev) => ({ codes, point, key: (prev?.key ?? 0) + 1 }));
    if (bounds) setView(fitBounds(bounds, FULL_VIEW));
    setSearchOpen(false);
  }

  function chooseCity(city: CoverageMapCity) {
    setQuery(city.name);
    // Sin forma (Nuevo Belén de Bajirá): se marca su departamento entero.
    const codes = SHAPE_CODES.has(city.code)
      ? [city.code]
      : departmentCodes(city.departmentName);
    goTo({ kind: "city", id: city.id }, cityBounds(city), codes);
  }

  function chooseDepartment(name: string) {
    setQuery(name);
    const codes = departmentCodes(name);
    const bounds =
      departmentGroups.find((group) => group.name === name)?.bounds ??
      (codes.some((code) => ISLAND_SHAPES[code]) ? ISLAND_RECT : null);
    goTo({ kind: "department", id: name }, bounds, codes);
  }

  function chooseLocality(result: TransportSearchResult) {
    if (!result.cityId || !result.cityCode) return;
    setQuery(result.name);
    // El mapa solo trae los corregimientos con tipo propio: este se suma para abrir su panel.
    if (!rows!.localities.some((locality) => locality.id === result.id)) {
      const locality: CoverageMapLocality = {
        id: result.id,
        code: result.code,
        name: result.name,
        cityId: result.cityId,
        cityCode: result.cityCode,
        shippingType: result.shippingType,
        effectiveShippingType: result.effectiveShippingType,
      };
      setRows((prev) =>
        prev ? { ...prev, localities: [...prev.localities, locality] } : prev,
      );
    }
    const next: Selected = { kind: "locality", id: result.id };
    const mainPoint = MAIN_POINTS[result.code];
    const islandPoint = ISLAND_POINTS[result.code];
    if (mainPoint) {
      const size = FULL_VIEW.w / 40;
      goTo(
        next,
        {
          x: mainPoint[0] - size / 2,
          y: mainPoint[1] - size / 2,
          w: size,
          h: size,
        },
        [],
        { x: mainPoint[0], y: mainPoint[1], island: false },
      );
      return;
    }
    if (islandPoint) {
      goTo(next, ISLAND_RECT, [], {
        x: islandPoint[0],
        y: islandPoint[1],
        island: true,
      });
      return;
    }
    // Sin punto en el archivo (los nuevos del CRM): se marca su municipio.
    const city = rows!.cities.find((c) => c.code === result.cityCode);
    goTo(next, city ? cityBounds(city) : null, [result.cityCode]);
  }

  const selectedDepartment =
    selected?.kind === "department" ? selected.id : undefined;
  const departmentCounts = selectedDepartment
    ? countCitiesByType(
        rows.cities.filter((city) => city.departmentName === selectedDepartment),
        SHAPE_CODES,
      )
    : null;
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
    if (!selected || selected.kind === "department" || !selectedPlace || !rows)
      return;
    const kind = selected.kind;
    setSaving(true);
    const departmentName =
      selectedCity?.departmentName ?? selectedParent?.departmentName ?? "";
    const ok = await onSave(
      kind,
      selected.id,
      next,
      selectedPlace.effectiveShippingType === "GRATIS",
      departmentName,
    );
    setSaving(false);
    if (ok) {
      setRows((prev) =>
        prev
          ? applyShippingTypeChange(prev, kind, selected.id, next)
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
            () => pick({ kind: "locality", id: locality.id }),
            "stroke-foreground",
          )}
        >
          <title>{label}</title>
        </circle>
      );
    });
  }

  function renderHighlight(shapes: Shapes, island: boolean, ringRadius: number) {
    if (!highlight) return null;
    const point = highlight.point?.island === island ? highlight.point : null;
    return (
      <g
        key={highlight.key}
        className="transporte-mapa-marca"
        pointerEvents="none"
      >
        {highlight.codes.map((code) =>
          shapes[code] ? (
            <path
              key={code}
              d={shapes[code]}
              fill="none"
              stroke={HIGHLIGHT_STROKE}
              strokeWidth={3}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null,
        )}
        {point ? (
          <circle
            cx={point.x}
            cy={point.y}
            r={ringRadius}
            fill="none"
            stroke={HIGHLIGHT_STROKE}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </g>
    );
  }

  const hasResults =
    departmentResults.length + cityResults.length + localityResults.length > 0;
  const resultClass =
    "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

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
        {ROAD_LEGEND.map(({ level, label }) => (
          <li key={level} className="flex items-center gap-1.5">
            <span
              className="w-4 rounded-full"
              style={{
                height: ROAD_STYLES[level].width + 1,
                backgroundColor: ROAD_STYLES[level].color,
              }}
            />
            {label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Toca un municipio o un punto (corregimiento con otro tipo) para cambiar
        su tipo de envío. Acerca con la rueda o con dos dedos y arrastra para
        moverte.
      </p>

      <div
        className="relative"
        onBlur={(event) => {
          // Se cierra la lista al salir del buscador, no al pasar del campo a un resultado.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setSearchOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSearchOpen(false);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Buscar municipio, corregimiento o departamento"
          aria-label="Buscar municipio, corregimiento o departamento"
          className="pl-9 pr-9"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar busqueda"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {searchOpen && searchReady ? (
          <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
            <ul>
              {departmentResults.map((name) => (
                <li key={`d-${name}`}>
                  <button
                    type="button"
                    className={resultClass}
                    onClick={() => chooseDepartment(name)}
                  >
                    <MapIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Departamento
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {cityResults.map((city) => (
                <li key={`c-${city.id}`}>
                  <button
                    type="button"
                    className={resultClass}
                    onClick={() => chooseCity(city)}
                  >
                    <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {city.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Municipio · {city.departmentName}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {localityResults.map((result) => (
                <li key={`l-${result.id}`}>
                  <button
                    type="button"
                    className={resultClass}
                    onClick={() => chooseLocality(result)}
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {result.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Corregimiento · {result.cityName}, {result.departmentName}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {searching ? (
              <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando
                corregimientos...
              </p>
            ) : searchFailed ? (
              <p className="px-2 py-2 text-xs text-destructive">
                No se pudieron buscar corregimientos. Intenta de nuevo.
              </p>
            ) : !hasResults ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                Sin resultados para “{query.trim()}”.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

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
          <style>{BLINK_CSS}</style>
          <g>{cityPaths?.main}</g>
          <TransporteRoads showMinor={view.w < MINOR_ROADS_MAX_W} />
          <g>{renderDots(MAIN_POINTS, 1.6 * zoomScale)}</g>
          {renderHighlight(MAIN_SHAPES, false, 5 * zoomScale)}
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
            <TransporteIslandRoads />
            <g>{renderDots(ISLAND_POINTS, 6 * zoomScale)}</g>
            {renderHighlight(ISLAND_SHAPES, true, 14 * zoomScale)}
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

        {/* La licencia de OpenStreetMap (ODbL) pide mostrar el crédito donde se ven sus datos. */}
        <p className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-muted-foreground">
          Carreteras © OpenStreetMap
        </p>

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

        {selectedDepartment && departmentCounts ? (
          <div className="absolute inset-x-2 top-2 ml-auto max-w-sm rounded-lg border border-border bg-background p-3 shadow-lg">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selectedDepartment}
                </p>
                <p className="text-xs text-muted-foreground">Departamento</p>
              </div>
              <button
                type="button"
                onClick={() => pick(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-1 text-xs text-foreground">
              {TYPES.map((type) => (
                <li key={type} className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: SHIPPING_MAP_COLORS[type] }}
                  />
                  {SHIPPING_LABELS[type]}:{" "}
                  <strong>{departmentCounts[type]}</strong>
                </li>
              ))}
              {departmentCounts.sinForma > 0 ? (
                <li className="text-muted-foreground">
                  {departmentCounts.sinForma}{" "}
                  {departmentCounts.sinForma === 1 ? "municipio" : "municipios"}{" "}
                  sin forma en el mapa
                </li>
              ) : null}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Toca un municipio para cambiar su tipo de envío.
            </p>
          </div>
        ) : selectedPlace ? (
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
                onClick={() => pick(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {selectedCity && !SHAPE_CODES.has(selectedCity.code) ? (
              <p className="mb-2 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                Este municipio no tiene forma en el mapa
              </p>
            ) : null}
            <ShippingTypeControl
              kind={selectedCity ? "city" : "locality"}
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
