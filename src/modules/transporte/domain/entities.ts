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
  cashOnDeliveryShipping: number | null; // envio contraentrega propio (COP); null = se cotiza o hereda de la ciudad
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
  cashOnDeliveryShipping: number | null; // envio contraentrega propio (COP); null = se cotiza o hereda de la ciudad
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
  cashOnDeliveryShipping: number | null; // envio contraentrega propio (COP); null = se cotiza o hereda de la ciudad
  needsReview: boolean;
  // Contexto para ubicar el lugar en la jerarquia.
  departmentName: string;
  cityName: string | null; // solo para corregimientos
  code: string; // codigo DANE (o CRM-...) del lugar
  cityId: string | null; // solo para corregimientos
  cityCode: string | null; // DANE de su municipio, solo para corregimientos
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
  cashOnDeliveryShipping: number | null; // envio contraentrega propio (COP); null = se cotiza o hereda de la ciudad
  createdAt: string; // ISO
};

// Opciones para los selectores en cascada de la pagina publica.
export type TransportOption = {
  id: string;
  name: string;
};

// Respuesta de la consulta publica de envio gratis.
export type TransportLookupResult = {
  envio: ShippingTypeName; // tipo de envio efectivo (misma regla del CRM)
  placeLabel: string;
};

export type TransportMetrics = {
  freeCityCount: number;
  freeLocalityCount: number;
  pendingReviewCount: number;
};

// Municipio para la vista de mapa (code = DANE de 5 digitos, el mismo de colombia-mapa.json).
export type CoverageMapCity = {
  id: string;
  code: string;
  name: string;
  departmentName: string;
  shippingType: ShippingTypeName | null; // tipo propio (null = automatico)
  effectiveShippingType: ShippingTypeName;
};

// Corregimiento con tipo propio, para los puntos del mapa.
export type CoverageMapLocality = {
  id: string;
  code: string;
  name: string;
  cityId: string;
  cityCode: string;
  shippingType: ShippingTypeName | null;
  effectiveShippingType: ShippingTypeName;
};
