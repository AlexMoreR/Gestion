// Tipos planos del modulo Transporte (sin dependencias de Prisma).

import type { ShippingTypeName } from "./shipping";

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
  shippingType: ShippingTypeName | null; // tipo propio (null = automatico, como antes)
  effectiveShippingType: ShippingTypeName; // el que aplica de verdad
  needsReview: boolean;
  localityCount: number;
  freeLocalityCount: number;
};

export type TransportLocalityRow = {
  id: string;
  code: string;
  name: string;
  freeShipping: boolean;
  shippingType: ShippingTypeName | null;
  effectiveShippingType: ShippingTypeName; // hereda el de la ciudad si no tiene propio
  needsReview: boolean;
};

// Resultado plano de una busqueda (ciudad o corregimiento) para el panel admin.
export type TransportSearchResult = {
  kind: "city" | "locality";
  id: string;
  name: string;
  freeShipping: boolean;
  shippingType: ShippingTypeName | null;
  effectiveShippingType: ShippingTypeName;
  needsReview: boolean;
  // Contexto para ubicar el lugar en la jerarquia.
  departmentName: string;
  cityName: string | null; // solo para corregimientos
};

// Ubicacion nueva (llego del CRM) que espera que un admin le defina el tipo de envio.
export type TransportPendingPlace = {
  kind: "city" | "locality";
  id: string;
  name: string;
  cityName: string | null;
  departmentName: string;
  source: string;
  freeShipping: boolean;
  shippingType: ShippingTypeName | null;
  effectiveShippingType: ShippingTypeName;
  createdAt: string; // ISO
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
  pendingReviewCount: number;
};
