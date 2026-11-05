// Reglas puras de la vista de mapa de cobertura (sin Prisma).

import type { CoverageMapCity, CoverageMapLocality } from "./entities";
import { resolveShippingType, type ShippingTypeName } from "./shipping";

export const SHIPPING_MAP_COLORS: Record<ShippingTypeName, string> = {
  GRATIS: "#16a34a", // verde
  ADICIONAL: "#2563eb", // azul
  COTIZAR: "#eab308", // amarillo
  NO_LLEGA: "#dc2626", // rojo
};

export type CoverageMapCounts = Record<ShippingTypeName, number> & { sinForma: number };

// Municipios por tipo efectivo. Los que no tienen forma en el mapa van aparte (sinForma),
// así la suma siempre da el total de municipios.
export function countCitiesByType(cities: CoverageMapCity[], shapeCodes: Set<string>): CoverageMapCounts {
  const counts: CoverageMapCounts = { GRATIS: 0, ADICIONAL: 0, COTIZAR: 0, NO_LLEGA: 0, sinForma: 0 };
  for (const city of cities) {
    if (shapeCodes.has(city.code)) {
      counts[city.effectiveShippingType] += 1;
    } else {
      counts.sinForma += 1;
    }
  }
  return counts;
}

// Corregimientos que se pintan como punto: solo los que tienen un tipo distinto al de su municipio.
export function localityDots(localities: CoverageMapLocality[], cities: CoverageMapCity[]): CoverageMapLocality[] {
  const cityType = new Map(cities.map((city) => [city.id, city.effectiveShippingType]));
  return localities.filter((locality) => {
    const parent = cityType.get(locality.cityId);
    return parent !== undefined && locality.effectiveShippingType !== parent;
  });
}

type CoverageMapRows = { cities: CoverageMapCity[]; localities: CoverageMapLocality[] };

// Recalcula en el navegador el tipo efectivo después de guardar desde el mapa, sin volver a pedir
// todo. El freeShipping guardado se deduce del tipo efectivo anterior (setPlaceShippingType lo
// sincroniza: GRATIS -> true, otro -> false; "Automático" no lo toca).
export function applyShippingTypeChange(
  rows: CoverageMapRows,
  kind: "city" | "locality",
  id: string,
  shippingType: ShippingTypeName | null,
): CoverageMapRows {
  if (kind === "city") {
    const cities = rows.cities.map((city) =>
      city.id === id
        ? {
            ...city,
            shippingType,
            effectiveShippingType: resolveShippingType({
              shippingType,
              freeShipping: city.effectiveShippingType === "GRATIS",
            }),
          }
        : city,
    );
    const byId = new Map(cities.map((city) => [city.id, city]));
    // Un corregimiento con tipo propio no cambia; uno en Automático hereda el nuevo tipo de la ciudad.
    const localities = rows.localities.map((locality) => {
      const city = byId.get(locality.cityId);
      if (locality.cityId !== id || locality.shippingType || !city) {
        return locality;
      }
      return { ...locality, effectiveShippingType: city.effectiveShippingType };
    });
    return { cities, localities };
  }
  const cityById = new Map(rows.cities.map((city) => [city.id, city]));
  const localities = rows.localities.map((locality) => {
    if (locality.id !== id) {
      return locality;
    }
    const city = cityById.get(locality.cityId);
    // Automático en un corregimiento = el tipo de su ciudad.
    const effectiveShippingType =
      shippingType ??
      (city
        ? resolveShippingType({
            shippingType: city.shippingType,
            freeShipping: city.effectiveShippingType === "GRATIS",
          })
        : locality.effectiveShippingType);
    return { ...locality, shippingType, effectiveShippingType };
  });
  return { cities: rows.cities, localities };
}

// Vista visible del mapa en unidades del SVG (lo que va en el viewBox).
export type MapView = { x: number; y: number; w: number; h: number };

// Zoom máximo: la vista nunca es más angosta que full.w / MAP_MAX_ZOOM.
export const MAP_MAX_ZOOM = 64;

// Deja la vista con la proporción de full, entre el zoom máximo y la vista completa, y dentro de
// sus bordes. Sirve también para mover (arrastrar) sin salirse del mapa.
export function clampView(view: MapView, full: MapView): MapView {
  const w = Math.min(Math.max(view.w, full.w / MAP_MAX_ZOOM), full.w);
  const h = (w * full.h) / full.w;
  return {
    x: Math.min(Math.max(view.x, full.x), full.x + full.w - w),
    y: Math.min(Math.max(view.y, full.y), full.y + full.h - h),
    w,
    h,
  };
}

// Acerca (factor > 1) o aleja (factor < 1) dejando quieto el punto (centroX, centroY).
export function zoomView(view: MapView, factor: number, centroX: number, centroY: number, full: MapView): MapView {
  const w = Math.min(Math.max(view.w / factor, full.w / MAP_MAX_ZOOM), full.w);
  const k = w / view.w;
  return clampView(
    { x: centroX - (centroX - view.x) * k, y: centroY - (centroY - view.y) * k, w, h: (w * full.h) / full.w },
    full,
  );
}

// Vista que encuadra una zona con la proporción de full; margen = fracción del tamaño de la zona
// que se deja libre a cada lado (0.1 = 10 %).
export function fitBounds(bounds: MapView, full: MapView, margen = 0.1): MapView {
  const aspect = full.w / full.h;
  const w = Math.max(bounds.w * (1 + 2 * margen), bounds.h * (1 + 2 * margen) * aspect, full.w / MAP_MAX_ZOOM);
  const h = w / aspect;
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  return clampView({ x: cx - w / 2, y: cy - h / 2, w, h }, full);
}
