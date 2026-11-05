import { describe, expect, it } from "vitest";
import {
  applyShippingTypeChange,
  countCitiesByType,
  fitBounds,
  groupCitiesByDepartment,
  localityDots,
  searchDepartments,
  searchMapCities,
  MAP_MAX_ZOOM,
  SHIPPING_MAP_COLORS,
  zoomView,
} from "./coverage-map";
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

describe("zoomView y fitBounds", () => {
  const full = { x: 0, y: 0, w: 606.5, h: 834.4 };

  it("acercar no pasa del zoom máximo y deja quieto el punto", () => {
    let view = full;
    for (let i = 0; i < 20; i++) view = zoomView(view, 2, 300, 400, full);
    expect(view.w).toBeCloseTo(full.w / MAP_MAX_ZOOM);
    expect(view.h / view.w).toBeCloseTo(full.h / full.w);
    expect(view.x).toBeLessThanOrEqual(300);
    expect(view.x + view.w).toBeGreaterThanOrEqual(300);
    const una = zoomView(full, 2, 100, 200, full);
    // El punto bajo el puntero queda en la misma fracción de la vista.
    expect((100 - una.x) / una.w).toBeCloseTo(100 / full.w);
    expect((200 - una.y) / una.h).toBeCloseTo(200 / full.h);
  });

  it("alejar nunca va más allá de toda Colombia", () => {
    const cerca = zoomView(full, 8, 590, 820, full);
    const lejos = zoomView(cerca, 1 / 100, 590, 820, full);
    expect(lejos).toEqual(full);
    const unPoco = zoomView(cerca, 1 / 2, 600, 830, full);
    expect(unPoco.x + unPoco.w).toBeLessThanOrEqual(full.w + 1e-9);
    expect(unPoco.y + unPoco.h).toBeLessThanOrEqual(full.h + 1e-9);
  });

  it("fitBounds respeta la proporción del mapa y contiene la zona", () => {
    const zona = { x: 100, y: 50, w: 200, h: 20 };
    const view = fitBounds(zona, full, 0.1);
    expect(view.h / view.w).toBeCloseTo(full.h / full.w);
    expect(view.x).toBeLessThanOrEqual(zona.x);
    expect(view.y).toBeLessThanOrEqual(zona.y);
    expect(view.x + view.w).toBeGreaterThanOrEqual(zona.x + zona.w);
    expect(view.y + view.h).toBeGreaterThanOrEqual(zona.y + zona.h);
    expect(view.y).toBeGreaterThanOrEqual(0);
    // Una zona diminuta no pasa del zoom máximo.
    expect(fitBounds({ x: 300, y: 300, w: 0.1, h: 0.1 }, full).w).toBeCloseTo(full.w / MAP_MAX_ZOOM);
  });
});

describe("groupCitiesByDepartment", () => {
  const items = [
    { code: "44001", departmentName: "La Guajira", bounds: { x: 10, y: 10, w: 5, h: 5 } },
    { code: "44847", departmentName: "La Guajira", bounds: { x: 20, y: 2, w: 10, h: 4 } },
    // Forma sin fila de ciudad: va a La Guajira por el código DANE.
    { code: "44090", bounds: { x: 8, y: 12, w: 2, h: 10 } },
    { code: "97001", departmentName: "Vaupés", bounds: { x: 100, y: 200, w: 6, h: 6 } },
  ];

  it("agrupa por departamento y la caja cubre a todos sus municipios", () => {
    const groups = groupCitiesByDepartment(items);
    expect(groups).toHaveLength(2);
    const guajira = groups.find((g) => g.name === "La Guajira")!;
    expect(guajira.codes.sort()).toEqual(["44001", "44090", "44847"]);
    for (const item of items.filter((i) => i.code.startsWith("44"))) {
      const b = item.bounds;
      expect(b.x).toBeGreaterThanOrEqual(guajira.bounds.x);
      expect(b.y).toBeGreaterThanOrEqual(guajira.bounds.y);
      expect(b.x + b.w).toBeLessThanOrEqual(guajira.bounds.x + guajira.bounds.w);
      expect(b.y + b.h).toBeLessThanOrEqual(guajira.bounds.y + guajira.bounds.h);
    }
    expect(guajira.bounds).toEqual({ x: 8, y: 2, w: 22, h: 20 });
    expect(guajira.center).toEqual({ x: 19, y: 12 });
    expect(groups.find((g) => g.name === "Vaupés")!.codes).toEqual(["97001"]);
  });

  it("sin ningún nombre agrupa por los dos primeros dígitos", () => {
    const groups = groupCitiesByDepartment([
      { code: "91001", bounds: { x: 0, y: 0, w: 1, h: 1 } },
      { code: "91263", bounds: { x: 2, y: 2, w: 1, h: 1 } },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("");
    expect(groups[0].codes).toEqual(["91001", "91263"]);
  });
});

describe("searchDepartments", () => {
  it("encuentra Antioquia sin importar tildes ni mayúsculas", () => {
    const nombres = ["Atlántico", "Antioquia", "Chocó", "Bogotá, D.C."];
    expect(searchDepartments(nombres, "antioquia")).toEqual(["Antioquia"]);
    expect(searchDepartments(nombres, "CHOCO")).toEqual(["Chocó"]);
    expect(searchDepartments(nombres, "bogota")).toEqual(["Bogotá, D.C."]);
    expect(searchDepartments(nombres, "xyz")).toEqual([]);
  });
});

describe("searchMapCities", () => {
  it("usa el mismo orden de la Lista y encuentra municipios sin forma", () => {
    const cali: CoverageMapCity = { ...riohacha, id: "c-cali", code: "76001", name: "Santiago de Cali" };
    const california: CoverageMapCity = { ...riohacha, id: "c-calif", code: "68132", name: "California" };
    expect(searchMapCities([california, cali], "cali").map((c) => c.name)).toEqual(["Santiago de Cali", "California"]);
    expect(searchMapCities([uribia, belen], "nuevo belen")[0].id).toBe("c-belen");
  });
});
