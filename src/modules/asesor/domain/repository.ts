import type { AppSnapshot } from "./app-overview";
import type { DayRange, ProductRow, QuoteRow, QuoteStatusCode, SaleDetail } from "./entities";

// Puerto de SOLO LECTURA. A proposito no tiene ningun metodo que escriba: el
// asesor de IA solo consulta. La ganancia por venta NO se calcula aqui: viene
// del modulo Balances (fuente unica de esa logica).
export interface AsesorReadRepository {
  getSaleDetails(saleIds: string[]): Promise<SaleDetail[]>;
  listQuotes(range: DayRange, statuses: readonly QuoteStatusCode[] | null): Promise<QuoteRow[]>;
  listProducts(search?: string): Promise<ProductRow[]>;
}

export type PackageManifest = {
  name: string | null;
  version: string | null;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

// Puerto de SOLO LECTURA para describir la propia aplicacion (radiografia).
// En produccion solo existen package.json, prisma/ y node_modules dentro del
// contenedor; lo demas viene de la foto generada en cada build.
export interface AppIntrospectionSource {
  readPrismaSchema(): Promise<string | null>;
  listMigrations(): Promise<string[]>;
  readPackageManifest(): Promise<PackageManifest | null>;
  readInstalledVersions(packageNames: string[]): Promise<Record<string, string | null>>;
  readBuildSnapshot(): Promise<AppSnapshot | null>;
  // El documento editable si existe en disco (desarrollo); en produccion viene en la foto.
  readOverviewDocument(): Promise<string | null>;
  countRecords(modelNames: string[]): Promise<Record<string, number | null>>;
}
