// Ranking puro (sin Prisma) de la busqueda de ciudades y corregimientos. Lo comparten el panel
// admin (searchTransportPlaces) y la API del CRM (searchPlacesForExternalApps).
import { normalizePlaceName } from "./shipping";

// Nombre comun -> codigo DANE de la ciudad. Los nombres oficiales llevan prefijos/sufijos que la
// gente no usa ("Santiago de Cali", "San Jose de Cucuta", "Cartagena de Indias", "Bogota, D.C.").
// Claves ya normalizadas (normalizePlaceName). Revisado contra data/colombia-divipola.json.
export const CITY_ALIASES: Readonly<Record<string, string>> = {
  cali: "76001", // Santiago de Cali
  bogota: "11001", // Bogota, D.C.
  "bogota dc": "11001",
  "bogota d.c.": "11001",
  "bogota d.c": "11001",
  cucuta: "54001", // San Jose de Cucuta
  cartagena: "13001", // Cartagena de Indias
  buga: "76111", // Guadalajara de Buga
  tumaco: "52835", // San Andres de Tumaco
  mariquita: "73443", // San Sebastian de Mariquita
  mompox: "13468", // Santa Cruz de Mompox
  mompos: "13468",
  tolu: "70820", // Santiago de Tolu
  toluviejo: "70823", // San Jose de Toluviejo
  ubate: "25843", // Villa de San Diego de Ubate
  since: "70742", // San Luis de Since
  "santa fe de antioquia": "05042", // Santa Fe de Antioquia (escrito sin tilde)
  "santafe de antioquia": "05042",
  quilichao: "19698", // Santander de Quilichao
};

export function aliasCityCode(term: string): string | null {
  return CITY_ALIASES[normalizePlaceName(term)] ?? null;
}

// En DIVIPOLA la capital de cada departamento es el municipio con codigo DD001
// (05001 Medellin, 76001 Cali, 11001 Bogota, 54001 Cucuta...).
export function isDepartmentCapitalCode(code: string | null | undefined): boolean {
  return typeof code === "string" && /^\d{2}001$/.test(code);
}

export type RankablePlace = {
  kind: "city" | "locality";
  name: string;
  nameKey?: string | null;
  code?: string | null;
};

// Puntaje de coincidencia (mayor = mejor; 0 = no coincide).
export const MATCH_SCORE = {
  alias: 5, // la ciudad a la que apunta el alias ("cali" -> Santiago de Cali)
  exact: 4, // nombre igual al termino
  word: 3, // contiene el termino como palabra completa ("cali" en "Santiago de Cali")
  prefix: 2, // empieza por el termino ("cali" en "California")
  contains: 1, // lo contiene en medio
  none: 0,
} as const;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function placeMatchScore(place: RankablePlace, term: string): number {
  const key = normalizePlaceName(term);
  if (key.length === 0) {
    return MATCH_SCORE.none;
  }
  const alias = CITY_ALIASES[key];
  if (alias && place.kind === "city" && place.code === alias) {
    return MATCH_SCORE.alias;
  }
  const nameKey = place.nameKey || normalizePlaceName(place.name);
  if (nameKey === key) {
    return MATCH_SCORE.exact;
  }
  // Limite de palabra: cualquier cosa que no sea letra o numero (espacio, coma, punto, guion).
  if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(key)}($|[^a-z0-9])`).test(nameKey)) {
    return MATCH_SCORE.word;
  }
  if (nameKey.startsWith(key)) {
    return MATCH_SCORE.prefix;
  }
  if (nameKey.includes(key)) {
    return MATCH_SCORE.contains;
  }
  return MATCH_SCORE.none;
}

// Ordena por puntaje; a igual puntaje: ciudades antes que corregimientos, capitales de
// departamento antes que el resto, luego alfabetico. Descarta lo que no coincide.
export function rankPlaces<T extends RankablePlace>(places: T[], term: string, limit?: number): T[] {
  const ranked = places
    .map((place) => ({ place, score: placeMatchScore(place, term) }))
    .filter((entry) => entry.score > MATCH_SCORE.none)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.place.kind === b.place.kind ? 0 : a.place.kind === "city" ? -1 : 1) ||
        Number(isCapital(b.place)) - Number(isCapital(a.place)) ||
        a.place.name.localeCompare(b.place.name, "es"),
    )
    .map((entry) => entry.place);
  return limit == null ? ranked : ranked.slice(0, Math.max(0, limit));
}

function isCapital(place: RankablePlace): boolean {
  return place.kind === "city" && isDepartmentCapitalCode(place.code);
}

// Coincidencia "exacta" para la API: nombre igual o la ciudad del alias.
export function isExactPlaceMatch(place: RankablePlace, term: string): boolean {
  return placeMatchScore(place, term) >= MATCH_SCORE.exact;
}
