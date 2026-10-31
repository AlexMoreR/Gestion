import type { AppSnapshot } from "./app-overview";
import type { DayRange, ExpenseLine, ProductRow, QuoteRow, QuoteStatusCode, SaleDetail, SupplierLedger } from "./entities";
import type { SaleLedgerInput } from "./payments";

// Filtro opcional de ventas para los abonos; sin filtro = todas las ventas.
export type SaleLedgerFilter = {
  saleIds?: string[];
  saleCodes?: string[];
};

// Puerto de SOLO LECTURA. A proposito no tiene ningun metodo que escriba: el
// asesor de IA solo consulta. La ganancia por venta NO se calcula aqui: viene
// del modulo Balances (fuente unica de esa logica).
export interface AsesorReadRepository {
  getSaleDetails(saleIds: string[]): Promise<SaleDetail[]>;
  listQuotes(range: DayRange, statuses: readonly QuoteStatusCode[] | null): Promise<QuoteRow[]>;
  listProducts(search?: string): Promise<ProductRow[]>;
  // Unidades vendidas por producto (productId) en ordenes de venta no canceladas creadas desde `desde`.
  unitsSoldByProduct(desde: Date): Promise<Map<string, number>>;
  // Ventas con sus abonos, fechas y saldo (pagadas o no).
  listSaleLedgers(filter?: SaleLedgerFilter): Promise<SaleLedgerInput[]>;
  // Gastos operativos con fecha de gasto dentro del rango.
  listExpenses(range: DayRange): Promise<ExpenseLine[]>;
  // Cuenta corriente de cada proveedora con movimientos, con las ordenes de esos movimientos.
  listSupplierLedgers(): Promise<SupplierLedger[]>;
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
