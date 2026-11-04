import { describe, expect, it } from "vitest";
import { applyShippingTypeChange, countCitiesByType, localityDots, SHIPPING_MAP_COLORS } from "./coverage-map";
import type { CoverageMapCity, CoverageMapLocality } from "./entities";

const uribia: CoverageMapCity = {
  id: "c-uribia",
  code: "44847",
  name: "Uribia",
  departmentName: "La Guajira",
  shippingType: "GRATIS",
  effectiveShippingType: "GRATIS",
};
const riohacha: CoverageMapCity = {
  id: "c-riohacha",
  code: "44001",
  name: "Riohacha",
  departmentName: "La Guajira",
  shippingType: null,
  effectiveShippingType: "COTIZAR",
};
const belen: CoverageMapCity = {
  id: "c-belen",
  code: "27493",
  name: "Nuevo Belén de Bajirá",
  departmentName: "Chocó",
  shippingType: "NO_LLEGA",
  effectiveShippingType: "NO_LLEGA",
};
const caboDeLaVela: CoverageMapLocality = {
  id: "l-cabo",
  code: "44847005",
  name: "Cabo de la Vela",
  cityId: uribia.id,
  cityCode: uribia.code,
  shippingType: "NO_LLEGA",
  effectiveShippingType: "NO_LLEGA",
};
const otroUribia: CoverageMapLocality = {
  ...caboDeLaVela,
  id: "l-otro",
  code: "44847010",
  name: "Otro",
  shippingType: "GRATIS",
  effectiveShippingType: "GRATIS",
};

describe("SHIPPING_MAP_COLORS", () => {
  it("cada tipo tiene su color hex", () => {
    expect(SHIPPING_MAP_COLORS).toEqual({
      GRATIS: "#16a34a",
      ADICIONAL: "#2563eb",
      COTIZAR: "#eab308",
      NO_LLEGA: "#dc2626",
    });
  });
});

describe("countCitiesByType", () => {
  it("cuenta por tipo efectivo y los conteos más sinForma suman el total", () => {
    const cities = [uribia, riohacha, belen];
    const counts = countCitiesByType(cities, new Set(["44847", "44001"]));
    expect(counts).toEqual({ GRATIS: 1, ADICIONAL: 0, COTIZAR: 1, NO_LLEGA: 0, sinForma: 1 });
    const suma = counts.GRATIS + counts.ADICIONAL + counts.COTIZAR + counts.NO_LLEGA + counts.sinForma;
    expect(suma).toBe(cities.length);
  });
});

describe("localityDots", () => {
  it("Cabo de la Vela (no llega) sale como punto dentro de Uribia (gratis); uno igual a su municipio no", () => {
    expect(localityDots([caboDeLaVela, otroUribia], [uribia])).toEqual([caboDeLaVela]);
  });
});

describe("applyShippingTypeChange", () => {
  const rows = { cities: [uribia, riohacha], localities: [caboDeLaVela] };

  it("Automático en un corregimiento toma el tipo de su ciudad y deja de ser punto", () => {
    const next = applyShippingTypeChange(rows, "locality", caboDeLaVela.id, null);
    expect(next.localities[0]).toMatchObject({ shippingType: null, effectiveShippingType: "GRATIS" });
    expect(localityDots(next.localities, next.cities)).toEqual([]);
  });

  it("Automático en una ciudad toma el tipo que resulta (gratis se queda gratis, otro pasa a cotizar)", () => {
    const gratis = applyShippingTypeChange(rows, "city", uribia.id, null);
    expect(gratis.cities[0]).toMatchObject({ shippingType: null, effectiveShippingType: "GRATIS" });
    const adicional = applyShippingTypeChange(
      { ...rows, cities: [{ ...riohacha, shippingType: "ADICIONAL", effectiveShippingType: "ADICIONAL" }] },
      "city",
      riohacha.id,
      null,
    );
    expect(adicional.cities[0]).toMatchObject({ shippingType: null, effectiveShippingType: "COTIZAR" });
  });

  it("un tipo propio se aplica tal cual y no cambia los corregimientos con tipo propio", () => {
    const next = applyShippingTypeChange(rows, "city", uribia.id, "NO_LLEGA");
    expect(next.cities[0].effectiveShippingType).toBe("NO_LLEGA");
    expect(next.localities[0]).toEqual(caboDeLaVela);
    expect(localityDots(next.localities, next.cities)).toEqual([]);
  });
});
