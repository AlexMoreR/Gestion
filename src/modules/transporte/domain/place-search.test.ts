import { describe, expect, it } from "vitest";

import divipola from "../data/colombia-divipola.json";
import {
  aliasCityCode,
  CITY_ALIASES,
  isDepartmentCapitalCode,
  isExactPlaceMatch,
  MATCH_SCORE,
  placeMatchScore,
  rankPlaces,
  type RankablePlace,
} from "./place-search";
import { normalizePlaceName } from "./shipping";

type Seed = {
  cities: Array<{ code: string; name: string }>;
  localities: Array<{ code: string; name: string }>;
};
const seed = divipola as Seed;

const allPlaces: RankablePlace[] = [
  ...seed.cities.map((city) => ({ kind: "city" as const, code: city.code, name: city.name, nameKey: normalizePlaceName(city.name) })),
  ...seed.localities.map((locality) => ({
    kind: "locality" as const,
    code: locality.code,
    name: locality.name,
    nameKey: normalizePlaceName(locality.name),
  })),
];

// Simula lo que trae la base (contains sobre nameKey + la ciudad del alias) y ordena.
function search(term: string, limit = 20): RankablePlace[] {
  const key = normalizePlaceName(term);
  const alias = aliasCityCode(key);
  const candidates = allPlaces.filter(
    (place) => place.nameKey!.includes(key) || (place.kind === "city" && place.code === alias),
  );
  return rankPlaces(candidates, term, limit);
}

describe("rankPlaces con datos DANE", () => {
  it("'Cali' -> Santiago de Cali primero (antes que California)", () => {
    const results = search("Cali");
    expect(results[0]).toMatchObject({ kind: "city", name: "Santiago de Cali" });
    const california = results.findIndex((place) => place.name === "California");
    expect(california).toBeGreaterThan(0);
  });

  it("'bogota' -> Bogotá, D.C. primero", () => {
    expect(search("bogota")[0]).toMatchObject({ kind: "city", name: "Bogotá, D.C." });
    expect(search("Bogotá D.C.")[0]).toMatchObject({ kind: "city", name: "Bogotá, D.C." });
  });

  it("'cucuta' -> San José de Cúcuta primero", () => {
    expect(search("cucuta")[0]).toMatchObject({ kind: "city", name: "San José de Cúcuta" });
  });

  it("'cartagena' -> Cartagena de Indias antes que los corregimientos llamados Cartagena", () => {
    const results = search("cartagena");
    expect(results[0]).toMatchObject({ kind: "city", name: "Cartagena de Indias" });
    expect(results.slice(1, 4).every((place) => place.name === "Cartagena")).toBe(true);
  });

  it("'buga' y 'tumaco' -> su ciudad DANE primero", () => {
    expect(search("buga")[0]).toMatchObject({ kind: "city", name: "Guadalajara de Buga" });
    expect(search("Tumaco")[0]).toMatchObject({ kind: "city", name: "San Andrés de Tumaco" });
  });

  it("'chia' -> Chía primero", () => {
    expect(search("chia")[0]).toMatchObject({ kind: "city", name: "Chía" });
  });

  it("'san' no rompe y respeta el limite", () => {
    const results = search("san", 50);
    expect(results).toHaveLength(50);
    expect(results.every((place) => placeMatchScore(place, "san") > 0)).toBe(true);
    // Primero las ciudades con "san" como palabra, capitales antes (San Andres 88001).
    expect(results[0]).toMatchObject({ kind: "city", name: "San Andrés" });
  });

  it("todos los alias apuntan a una ciudad que existe", () => {
    const cityCodes = new Set(seed.cities.map((city) => city.code));
    for (const code of Object.values(CITY_ALIASES)) {
      expect(cityCodes.has(code)).toBe(true);
    }
  });
});

describe("placeMatchScore", () => {
  const city = (name: string, code = "99999"): RankablePlace => ({ kind: "city", name, code });

  it("puntua exacta > palabra > empieza por > contiene", () => {
    expect(placeMatchScore(city("Chía"), "chia")).toBe(MATCH_SCORE.exact);
    expect(placeMatchScore(city("Puerto Cali"), "cali")).toBe(MATCH_SCORE.word);
    expect(placeMatchScore(city("California"), "cali")).toBe(MATCH_SCORE.prefix);
    expect(placeMatchScore(city("Escalia"), "cali")).toBe(MATCH_SCORE.contains);
    expect(placeMatchScore(city("Medellín"), "cali")).toBe(MATCH_SCORE.none);
    expect(placeMatchScore(city("Santiago de Cali", "76001"), "cali")).toBe(MATCH_SCORE.alias);
  });

  it("el alias solo aplica a la ciudad, no a un corregimiento con el mismo codigo", () => {
    expect(placeMatchScore({ kind: "locality", name: "Santiago de Cali", code: "76001" }, "cali")).toBe(MATCH_SCORE.word);
  });

  it("exacta incluye el alias", () => {
    expect(isExactPlaceMatch(city("Santiago de Cali", "76001"), "Cali")).toBe(true);
    expect(isExactPlaceMatch(city("California"), "Cali")).toBe(false);
  });

  it("no rompe con caracteres especiales de regex", () => {
    expect(() => placeMatchScore(city("San (x)"), "(x")).not.toThrow();
    expect(placeMatchScore(city("San (x)"), "(x")).toBeGreaterThan(0);
  });
});

describe("desempates", () => {
  it("ciudades antes que corregimientos, luego capitales, luego alfabetico", () => {
    const places: RankablePlace[] = [
      { kind: "locality", name: "Aaa Prueba", code: "05001001" },
      { kind: "city", name: "Zzz Prueba", code: "05002" },
      { kind: "city", name: "Mmm Prueba", code: "05001" },
      { kind: "city", name: "Bbb Prueba", code: "05003" },
    ];
    expect(rankPlaces(places, "prueba").map((place) => place.name)).toEqual([
      "Mmm Prueba",
      "Bbb Prueba",
      "Zzz Prueba",
      "Aaa Prueba",
    ]);
  });

  it("detecta capitales por codigo DD001", () => {
    expect(isDepartmentCapitalCode("76001")).toBe(true);
    expect(isDepartmentCapitalCode("76111")).toBe(false);
    expect(isDepartmentCapitalCode("76001001")).toBe(false);
    expect(isDepartmentCapitalCode(null)).toBe(false);
  });
});
