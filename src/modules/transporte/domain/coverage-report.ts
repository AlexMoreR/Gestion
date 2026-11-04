// Regla pura del informe de cobertura de envíos (sin Prisma): tipo efectivo de cada municipio y
// corregimiento, totales por tipo y solo los corregimientos que se salen del tipo de su municipio.
import { normalizePlaceName, resolveShippingType, type ShippingTypeName } from "./shipping";

export type CoveragePlaceRow = {
  nombre: string;
  shippingType: ShippingTypeName | null;
  freeShipping: boolean;
  needsReview: boolean;
};

export type CoverageCityRow = CoveragePlaceRow & { corregimientos: CoveragePlaceRow[] };

export type CoverageDepartmentRow = { nombre: string; municipios: CoverageCityRow[] };

export type CoverageTypeFilter = "gratis" | "adicional" | "cotizar" | "no_llega";

export type CoverageFilters = { departamento?: string; tipo?: CoverageTypeFilter };

type TypeTotals = Record<ShippingTypeName, number>;

export type CoverageReport = {
  totales: { municipios: TypeTotals; corregimientos: TypeTotals };
  departamentos: Array<{
    departamento: string;
    municipios: Array<{
      municipio: string;
      tipo: ShippingTypeName;
      pendiente_revision: boolean;
      corregimientos_distintos: Array<{ nombre: string; tipo: ShippingTypeName; pendiente_revision: boolean }>;
    }>;
  }>;
};

const emptyTotals = (): TypeTotals => ({ GRATIS: 0, ADICIONAL: 0, COTIZAR: 0, NO_LLEGA: 0 });

export function buildCoverageReport(filas: CoverageDepartmentRow[], filtros: CoverageFilters = {}): CoverageReport {
  const depKey = filtros.departamento ? normalizePlaceName(filtros.departamento) : "";
  const tipo = filtros.tipo ? (filtros.tipo.toUpperCase() as ShippingTypeName) : null;
  const totales = { municipios: emptyTotals(), corregimientos: emptyTotals() };
  const departamentos: CoverageReport["departamentos"] = [];

  for (const dep of filas) {
    if (depKey && normalizePlaceName(dep.nombre) !== depKey) continue;
    const municipios: CoverageReport["departamentos"][number]["municipios"] = [];

    for (const city of dep.municipios) {
      const cityType = resolveShippingType({ shippingType: city.shippingType, freeShipping: city.freeShipping });
      totales.municipios[cityType] += 1;

      const distintos: CoverageReport["departamentos"][number]["municipios"][number]["corregimientos_distintos"] = [];
      for (const loc of city.corregimientos) {
        // El corregimiento hereda el tipo de su ciudad con la misma regla de shipping.ts.
        const locType = resolveShippingType({
          shippingType: loc.shippingType,
          freeShipping: loc.freeShipping,
          parent: { shippingType: city.shippingType, freeShipping: city.freeShipping },
        });
        totales.corregimientos[locType] += 1;
        if (locType !== cityType && (!tipo || locType === tipo)) {
          distintos.push({ nombre: loc.nombre, tipo: locType, pendiente_revision: loc.needsReview });
        }
      }

      // Con filtro de tipo, el municipio sale si es de ese tipo o como contenedor de corregimientos de ese tipo.
      if (tipo && cityType !== tipo && distintos.length === 0) continue;
      municipios.push({
        municipio: city.nombre,
        tipo: cityType,
        pendiente_revision: city.needsReview,
        corregimientos_distintos: distintos,
      });
    }

    if (municipios.length > 0) departamentos.push({ departamento: dep.nombre, municipios });
  }

  return { totales, departamentos };
}
