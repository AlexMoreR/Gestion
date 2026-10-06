import { prisma } from "@/lib/prisma";
import divipola from "../data/colombia-divipola.json";
import type {
  TransportCityRow,
  TransportDepartmentSummary,
  TransportLocalityRow,
  TransportLookupResult,
  TransportMetrics,
  TransportOption,
  TransportPendingPlace,
  TransportSearchResult,
} from "../domain/entities";
import {
  normalizePlaceName,
  resolveProductShippingExtra,
  resolveShippingType,
  type ShippingTypeName,
} from "../domain/shipping";

type SeedData = {
  departments: Array<{ code: string; name: string }>;
  cities: Array<{ code: string; dep: string; name: string }>;
  localities: Array<{ code: string; city: string; name: string }>;
};

const seed = divipola as SeedData;

async function createManyInChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  chunkSize = 1000,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await insert(rows.slice(i, i + chunkSize));
  }
}

// Carga los datos DANE la primera vez que se usa el modulo (patron perezoso,
// igual que las categorias de gastos). Idempotente: si ya hay departamentos no
// hace nada, y createMany usa skipDuplicates por si quedara a medias.
export async function ensureTransportSeed(): Promise<void> {
  const existing = await prisma.transportDepartment.count();
  if (existing > 0) {
    return;
  }

  await prisma.transportDepartment.createMany({
    data: seed.departments.map((department) => ({ code: department.code, name: department.name })),
    skipDuplicates: true,
  });

  const departments = await prisma.transportDepartment.findMany({ select: { id: true, code: true } });
  const departmentByCode = new Map(departments.map((department) => [department.code, department.id]));

  const cityRows = seed.cities
    .filter((city) => departmentByCode.has(city.dep))
    .map((city) => ({
      code: city.code,
      name: city.name,
      nameKey: normalizePlaceName(city.name),
      departmentId: departmentByCode.get(city.dep)!,
    }));
  await createManyInChunks(cityRows, (chunk) =>
    prisma.transportCity.createMany({ data: chunk, skipDuplicates: true }),
  );

  const cities = await prisma.transportCity.findMany({ select: { id: true, code: true } });
  const cityByCode = new Map(cities.map((city) => [city.code, city.id]));

  const localityRows = seed.localities
    .filter((locality) => cityByCode.has(locality.city))
    .map((locality) => ({
      code: locality.code,
      name: locality.name,
      nameKey: normalizePlaceName(locality.name),
      cityId: cityByCode.get(locality.city)!,
    }));
  await createManyInChunks(localityRows, (chunk) =>
    prisma.transportLocality.createMany({ data: chunk, skipDuplicates: true }),
  );
}

// --- Lectura para el panel admin ---

export async function listDepartmentSummaries(): Promise<TransportDepartmentSummary[]> {
  const [departments, cityGroups, freeCityGroups] = await Promise.all([
    prisma.transportDepartment.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.transportCity.groupBy({ by: ["departmentId"], _count: { _all: true } }),
    prisma.transportCity.groupBy({
      by: ["departmentId"],
      where: { freeShipping: true },
      _count: { _all: true },
    }),
  ]);

  const cityCountByDep = new Map(cityGroups.map((group) => [group.departmentId, group._count._all]));
  const freeCountByDep = new Map(freeCityGroups.map((group) => [group.departmentId, group._count._all]));

  return departments.map((department) => ({
    id: department.id,
    code: department.code,
    name: department.name,
    cityCount: cityCountByDep.get(department.id) ?? 0,
    freeCityCount: freeCountByDep.get(department.id) ?? 0,
  }));
}

export async function getTransportMetrics(): Promise<TransportMetrics> {
  const [freeCityCount, freeLocalityCount, pendingCities, pendingLocalities] = await Promise.all([
    prisma.transportCity.count({ where: { freeShipping: true } }),
    prisma.transportLocality.count({ where: { freeShipping: true } }),
    prisma.transportCity.count({ where: { needsReview: true } }),
    prisma.transportLocality.count({ where: { needsReview: true } }),
  ]);
  return { freeCityCount, freeLocalityCount, pendingReviewCount: pendingCities + pendingLocalities };
}

export async function listCitiesByDepartment(departmentId: string): Promise<TransportCityRow[]> {
  const cities = await prisma.transportCity.findMany({
    where: { departmentId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      freeShipping: true,
      shippingType: true,
      needsReview: true,
      _count: { select: { localities: true } },
      localities: { where: { freeShipping: true }, select: { id: true } },
    },
  });

  return cities.map((city) => ({
    id: city.id,
    code: city.code,
    name: city.name,
    freeShipping: city.freeShipping,
    shippingType: city.shippingType,
    effectiveShippingType: resolveShippingType({ shippingType: city.shippingType, freeShipping: city.freeShipping }),
    needsReview: city.needsReview,
    localityCount: city._count.localities,
    freeLocalityCount: city.localities.length,
  }));
}

export async function listLocalitiesByCity(cityId: string): Promise<TransportLocalityRow[]> {
  const [city, localities] = await Promise.all([
    prisma.transportCity.findUnique({ where: { id: cityId }, select: { shippingType: true, freeShipping: true } }),
    prisma.transportLocality.findMany({
      where: { cityId },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, freeShipping: true, shippingType: true, needsReview: true },
    }),
  ]);
  return localities.map((locality) => ({
    ...locality,
    effectiveShippingType: resolveShippingType({
      shippingType: locality.shippingType,
      freeShipping: locality.freeShipping,
      parent: city,
    }),
  }));
}

const placeShippingSelect = { id: true, name: true, freeShipping: true, shippingType: true, needsReview: true } as const;
const cityParentSelect = { shippingType: true, freeShipping: true } as const;

// Busqueda por nombre en ciudades y corregimientos (limitada para el panel). Ignora acentos y
// mayusculas usando nameKey (y el nombre tal cual por si alguna fila aun no tiene nameKey).
export async function searchTransportPlaces(term: string): Promise<TransportSearchResult[]> {
  const query = term.trim();
  const key = normalizePlaceName(query);
  if (key.length < 2) {
    return [];
  }

  const nameFilter = { OR: [{ nameKey: { contains: key } }, { name: { contains: query, mode: "insensitive" as const } }] };

  const [cities, localities] = await Promise.all([
    prisma.transportCity.findMany({
      where: nameFilter,
      orderBy: { name: "asc" },
      take: 40,
      select: { ...placeShippingSelect, department: { select: { name: true } } },
    }),
    prisma.transportLocality.findMany({
      where: nameFilter,
      orderBy: { name: "asc" },
      take: 40,
      select: {
        ...placeShippingSelect,
        city: { select: { name: true, ...cityParentSelect, department: { select: { name: true } } } },
      },
    }),
  ]);

  const cityResults: TransportSearchResult[] = cities.map((city) => ({
    kind: "city",
    id: city.id,
    name: city.name,
    freeShipping: city.freeShipping,
    shippingType: city.shippingType,
    effectiveShippingType: resolveShippingType({ shippingType: city.shippingType, freeShipping: city.freeShipping }),
    needsReview: city.needsReview,
    departmentName: city.department.name,
    cityName: null,
  }));

  const localityResults: TransportSearchResult[] = localities.map((locality) => ({
    kind: "locality",
    id: locality.id,
    name: locality.name,
    freeShipping: locality.freeShipping,
    shippingType: locality.shippingType,
    effectiveShippingType: resolveShippingType({
      shippingType: locality.shippingType,
      freeShipping: locality.freeShipping,
      parent: { shippingType: locality.city.shippingType, freeShipping: locality.city.freeShipping },
    }),
    needsReview: locality.needsReview,
    departmentName: locality.city.department.name,
    cityName: locality.city.name,
  }));

  return [...cityResults, ...localityResults].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// --- Envios por tipo (GRATIS / ADICIONAL / COTIZAR / NO_LLEGA) ---

// Guarda el tipo de envio de una ciudad o corregimiento y mantiene freeShipping sincronizado
// (lo usa /cobertura): GRATIS -> true, cualquier otro -> false. null vuelve al comportamiento de siempre.
export async function setPlaceShippingType(
  kind: "city" | "locality",
  id: string,
  shippingType: ShippingTypeName | null,
): Promise<void> {
  const data =
    shippingType == null
      ? { shippingType: null, needsReview: false }
      : { shippingType, freeShipping: shippingType === "GRATIS", needsReview: false };
  if (kind === "city") {
    await prisma.transportCity.update({ where: { id }, data });
  } else {
    await prisma.transportLocality.update({ where: { id }, data });
  }
}

// Ubicaciones pendientes de revisar (hoy solo llegan corregimientos desde el CRM, pero se
// incluyen ciudades por si alguna queda marcada). Mas recientes primero.
export async function listPendingReview(): Promise<TransportPendingPlace[]> {
  const [cities, localities] = await Promise.all([
    prisma.transportCity.findMany({
      where: { needsReview: true },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { ...placeShippingSelect, source: true, createdAt: true, department: { select: { name: true } } },
    }),
    prisma.transportLocality.findMany({
      where: { needsReview: true },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        ...placeShippingSelect,
        source: true,
        createdAt: true,
        city: { select: { name: true, ...cityParentSelect, department: { select: { name: true } } } },
      },
    }),
  ]);

  const cityRows: TransportPendingPlace[] = cities.map((city) => ({
    kind: "city",
    id: city.id,
    name: city.name,
    cityName: null,
    departmentName: city.department.name,
    source: city.source,
    freeShipping: city.freeShipping,
    shippingType: city.shippingType,
    effectiveShippingType: resolveShippingType({ shippingType: city.shippingType, freeShipping: city.freeShipping }),
    createdAt: city.createdAt.toISOString(),
  }));

  const localityRows: TransportPendingPlace[] = localities.map((locality) => ({
    kind: "locality",
    id: locality.id,
    name: locality.name,
    cityName: locality.city.name,
    departmentName: locality.city.department.name,
    source: locality.source,
    freeShipping: locality.freeShipping,
    shippingType: locality.shippingType,
    effectiveShippingType: resolveShippingType({
      shippingType: locality.shippingType,
      freeShipping: locality.freeShipping,
      parent: { shippingType: locality.city.shippingType, freeShipping: locality.city.freeShipping },
    }),
    createdAt: locality.createdAt.toISOString(),
  }));

  return [...cityRows, ...localityRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Busqueda para otras apps (CRM): tolerante a acentos y mayusculas, coincidencias exactas primero.
export type ExternalPlaceMatch = {
  tipo: "ciudad" | "corregimiento";
  id: string;
  cityId: string;
  nombre: string;
  ciudad: string;
  departamento: string;
  envio: ShippingTypeName;
  pendienteRevision: boolean;
  exacta: boolean;
};

export async function searchPlacesForExternalApps(term: string, limit = 20): Promise<ExternalPlaceMatch[]> {
  const key = normalizePlaceName(term);
  if (key.length < 2) {
    return [];
  }
  const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50);
  const query = term.trim();

  // Las exactas se piden aparte: con "san" o "cali" hay cientos de coincidencias parciales y la
  // exacta podria quedar fuera del recorte. El resto se trae con un margen y se ordena aca.
  const exactFilter = { OR: [{ nameKey: key }, { name: { equals: query, mode: "insensitive" as const } }] };
  const partialFilter = { OR: [{ nameKey: { contains: key } }, { name: { contains: query, mode: "insensitive" as const } }] };
  const citySelect = { ...placeShippingSelect, nameKey: true, department: { select: { name: true } } } as const;
  const localitySelect = {
    ...placeShippingSelect,
    nameKey: true,
    city: { select: { id: true, name: true, ...cityParentSelect, department: { select: { name: true } } } },
  } as const;
  const pool = Math.min(take * 3, 150);

  const [exactCities, exactLocalities, partialCities, partialLocalities] = await Promise.all([
    prisma.transportCity.findMany({ where: exactFilter, take: 50, select: citySelect }),
    prisma.transportLocality.findMany({ where: exactFilter, take: 50, select: localitySelect }),
    prisma.transportCity.findMany({ where: partialFilter, orderBy: { name: "asc" }, take: pool, select: citySelect }),
    prisma.transportLocality.findMany({ where: partialFilter, orderBy: { name: "asc" }, take: pool, select: localitySelect }),
  ]);

  const uniqueById = <T extends { id: string }>(rows: T[]): T[] => Array.from(new Map(rows.map((row) => [row.id, row])).values());
  const cities = uniqueById([...exactCities, ...partialCities]);
  const localities = uniqueById([...exactLocalities, ...partialLocalities]);

  const cityMatches: ExternalPlaceMatch[] = cities.map((city) => ({
    tipo: "ciudad",
    id: city.id,
    cityId: city.id,
    nombre: city.name,
    ciudad: city.name,
    departamento: city.department.name,
    envio: resolveShippingType({ shippingType: city.shippingType, freeShipping: city.freeShipping }),
    pendienteRevision: city.needsReview,
    exacta: (city.nameKey ?? normalizePlaceName(city.name)) === key,
  }));

  const localityMatches: ExternalPlaceMatch[] = localities.map((locality) => ({
    tipo: "corregimiento",
    id: locality.id,
    cityId: locality.city.id,
    nombre: locality.name,
    ciudad: locality.city.name,
    departamento: locality.city.department.name,
    envio: resolveShippingType({
      shippingType: locality.shippingType,
      freeShipping: locality.freeShipping,
      parent: { shippingType: locality.city.shippingType, freeShipping: locality.city.freeShipping },
    }),
    pendienteRevision: locality.needsReview,
    exacta: (locality.nameKey ?? normalizePlaceName(locality.name)) === key,
  }));

  // Exactas primero, luego ciudades antes que corregimientos, luego alfabetico.
  return [...cityMatches, ...localityMatches]
    .sort(
      (a, b) =>
        Number(b.exacta) - Number(a.exacta) ||
        (a.tipo === b.tipo ? 0 : a.tipo === "ciudad" ? -1 : 1) ||
        a.nombre.localeCompare(b.nombre, "es"),
    )
    .slice(0, take);
}

// Agrega un corregimiento/barrio/vereda bajo una ciudad existente, SIN duplicar: si ya existe
// uno con el mismo nombre normalizado en esa ciudad, lo devuelve. Lo nuevo queda pendiente de
// revisar y sin tipo (hereda el de la ciudad hasta que un admin lo defina).
export async function addLocalityIfMissing(params: {
  cityId: string;
  name: string;
  source: string;
}): Promise<{ creado: boolean; id: string; nombre: string } | null> {
  const name = params.name.replace(/\s+/g, " ").trim();
  const key = normalizePlaceName(name);
  if (key.length < 2) {
    return null;
  }

  const city = await prisma.transportCity.findUnique({ where: { id: params.cityId }, select: { id: true, code: true } });
  if (!city) {
    return null;
  }

  const existing = await prisma.transportLocality.findFirst({
    where: { cityId: city.id, nameKey: key },
    select: { id: true, name: true },
  });
  if (existing) {
    return { creado: false, id: existing.id, nombre: existing.name };
  }

  // Codigo deterministico por ciudad + nombre: si dos pedidos llegan a la vez, el indice unico
  // de "code" impide el duplicado y se devuelve el que ya quedo.
  const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const code = `CRM-${city.code}-${slug || Date.now().toString(36)}`;
  try {
    const created = await prisma.transportLocality.create({
      data: { cityId: city.id, name, nameKey: key, code, needsReview: true, source: params.source },
      select: { id: true, name: true },
    });
    return { creado: true, id: created.id, nombre: created.name };
  } catch (error) {
    const again = await prisma.transportLocality.findFirst({
      where: { OR: [{ code }, { cityId: city.id, nameKey: key }] },
      select: { id: true, name: true },
    });
    if (again) {
      return { creado: false, id: again.id, nombre: again.name };
    }
    throw error;
  }
}

// Precio y valor de envio ADICIONAL de un producto por codigo (para cotizar un solo total).
export async function findProductShippingInfo(
  code: string,
): Promise<{ codigo: string; nombre: string; precio: number; envioAdicional: number | null } | null> {
  const product = await prisma.product.findFirst({
    where: { code: { equals: code.trim(), mode: "insensitive" } },
    select: { code: true, name: true, price: true, shippingExtra: true, category: { select: { shippingExtra: true } } },
  });
  if (!product) {
    return null;
  }
  return {
    codigo: product.code ?? code,
    nombre: product.name,
    precio: Number(product.price),
    envioAdicional: resolveProductShippingExtra({
      shippingExtra: product.shippingExtra,
      categoryShippingExtra: product.category?.shippingExtra ?? null,
    }),
  };
}

// --- Consulta publica (pagina del cliente) ---

export async function listDepartmentOptions(): Promise<TransportOption[]> {
  return prisma.transportDepartment.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listCityOptions(departmentId: string): Promise<TransportOption[]> {
  return prisma.transportCity.findMany({
    where: { departmentId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listLocalityOptions(cityId: string): Promise<TransportOption[]> {
  return prisma.transportLocality.findMany({
    where: { cityId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// Resuelve si aplica envio gratis para la ubicacion elegida. Si se eligio un
// corregimiento, manda su marca; si no, la de la ciudad.
export async function resolveFreeShipping(params: {
  cityId: string;
  localityId?: string | null;
}): Promise<TransportLookupResult | null> {
  const city = await prisma.transportCity.findUnique({
    where: { id: params.cityId },
    select: { name: true, freeShipping: true, department: { select: { name: true } } },
  });
  if (!city) {
    return null;
  }

  if (params.localityId) {
    const locality = await prisma.transportLocality.findFirst({
      where: { id: params.localityId, cityId: params.cityId },
      select: { name: true, freeShipping: true },
    });
    if (locality) {
      return {
        freeShipping: locality.freeShipping,
        placeLabel: `${locality.name}, ${city.name} (${city.department.name})`,
      };
    }
  }

  return {
    freeShipping: city.freeShipping,
    placeLabel: `${city.name}, ${city.department.name}`,
  };
}
