import { prisma } from "@/lib/prisma";
import divipola from "../data/colombia-divipola.json";
import type {
  TransportCityRow,
  TransportDepartmentSummary,
  TransportLocalityRow,
  TransportLookupResult,
  TransportMetrics,
  TransportOption,
  TransportSearchResult,
} from "../domain/entities";

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
    .map((city) => ({ code: city.code, name: city.name, departmentId: departmentByCode.get(city.dep)! }));
  await createManyInChunks(cityRows, (chunk) =>
    prisma.transportCity.createMany({ data: chunk, skipDuplicates: true }),
  );

  const cities = await prisma.transportCity.findMany({ select: { id: true, code: true } });
  const cityByCode = new Map(cities.map((city) => [city.code, city.id]));

  const localityRows = seed.localities
    .filter((locality) => cityByCode.has(locality.city))
    .map((locality) => ({ code: locality.code, name: locality.name, cityId: cityByCode.get(locality.city)! }));
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
  const [freeCityCount, freeLocalityCount] = await Promise.all([
    prisma.transportCity.count({ where: { freeShipping: true } }),
    prisma.transportLocality.count({ where: { freeShipping: true } }),
  ]);
  return { freeCityCount, freeLocalityCount };
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
      _count: { select: { localities: true } },
      localities: { where: { freeShipping: true }, select: { id: true } },
    },
  });

  return cities.map((city) => ({
    id: city.id,
    code: city.code,
    name: city.name,
    freeShipping: city.freeShipping,
    localityCount: city._count.localities,
    freeLocalityCount: city.localities.length,
  }));
}

export async function listLocalitiesByCity(cityId: string): Promise<TransportLocalityRow[]> {
  const localities = await prisma.transportLocality.findMany({
    where: { cityId },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, freeShipping: true },
  });
  return localities;
}

// Busqueda por nombre en ciudades y corregimientos (limitada para el panel).
export async function searchTransportPlaces(term: string): Promise<TransportSearchResult[]> {
  const query = term.trim();
  if (query.length < 2) {
    return [];
  }

  const [cities, localities] = await Promise.all([
    prisma.transportCity.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: 40,
      select: { id: true, name: true, freeShipping: true, department: { select: { name: true } } },
    }),
    prisma.transportLocality.findMany({
      where: { name: { contains: query, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: 40,
      select: {
        id: true,
        name: true,
        freeShipping: true,
        city: { select: { name: true, department: { select: { name: true } } } },
      },
    }),
  ]);

  const cityResults: TransportSearchResult[] = cities.map((city) => ({
    kind: "city",
    id: city.id,
    name: city.name,
    freeShipping: city.freeShipping,
    departmentName: city.department.name,
    cityName: null,
  }));

  const localityResults: TransportSearchResult[] = localities.map((locality) => ({
    kind: "locality",
    id: locality.id,
    name: locality.name,
    freeShipping: locality.freeShipping,
    departmentName: locality.city.department.name,
    cityName: locality.city.name,
  }));

  return [...cityResults, ...localityResults].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// --- Escritura (toggles) ---

export async function setCityFreeShipping(cityId: string, freeShipping: boolean): Promise<void> {
  await prisma.transportCity.update({ where: { id: cityId }, data: { freeShipping } });
}

export async function setLocalityFreeShipping(localityId: string, freeShipping: boolean): Promise<void> {
  await prisma.transportLocality.update({ where: { id: localityId }, data: { freeShipping } });
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
