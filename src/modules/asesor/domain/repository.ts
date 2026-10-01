import type { DayRange, ProductRow, QuoteRow, QuoteStatusCode, SaleDetail } from "./entities";

// Puerto de SOLO LECTURA. A proposito no tiene ningun metodo que escriba: el
// asesor de IA solo consulta. La ganancia por venta NO se calcula aqui: viene
// del modulo Balances (fuente unica de esa logica).
export interface AsesorReadRepository {
  getSaleDetails(saleIds: string[]): Promise<SaleDetail[]>;
  listQuotes(range: DayRange, statuses: readonly QuoteStatusCode[] | null): Promise<QuoteRow[]>;
  listProducts(search?: string): Promise<ProductRow[]>;
}
