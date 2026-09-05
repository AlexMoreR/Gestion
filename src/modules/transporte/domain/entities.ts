// Tipos planos del modulo Transporte (sin dependencias de Prisma).

export type TransportDepartmentSummary = {
  id: string;
  code: string;
  name: string;
  cityCount: number;
  freeCityCount: number;
};

export type TransportCityRow = {
  id: string;
  code: string;
  name: string;
  freeShipping: boolean;
  localityCount: number;
  freeLocalityCount: number;
};

export type TransportLocalityRow = {
  id: string;
  code: string;
  name: string;
  freeShipping: boolean;
};

// Resultado plano de una busqueda (ciudad o corregimiento) para el panel admin.
export type TransportSearchResult = {
  kind: "city" | "locality";
  id: string;
  name: string;
  freeShipping: boolean;
  // Contexto para ubicar el lugar en la jerarquia.
  departmentName: string;
  cityName: string | null; // solo para corregimientos
};

// Opciones para los selectores en cascada de la pagina publica.
export type TransportOption = {
  id: string;
  name: string;
};

// Respuesta de la consulta publica de envio gratis.
export type TransportLookupResult = {
  freeShipping: boolean;
  placeLabel: string;
};

export type TransportMetrics = {
  freeCityCount: number;
  freeLocalityCount: number;
};
