// Modulo "asesor": consultas de SOLO LECTURA para el asesor de IA (servidor MCP).
// Tipos planos, sin Prisma.

export type DayRange = {
  // Semiabierto [from, to): misma convencion que Balances (dias calendario en UTC).
  from: Date;
  to: Date;
};

export type Seller = {
  id: string;
  name: string;
};

export type SaleProductLine = {
  nombre: string;
  codigo: string | null;
  cantidad: number;
};

// Datos de una venta que no estan en el calculo de ganancia (Balances).
export type SaleDetail = {
  saleId: string;
  saleCode: string;
  quoteCode: string | null;
  orderCode: string | null;
  saleDate: Date;
  clientName: string | null;
  // Vendedora = quien creo la cotizacion (no existe un campo "vendedora").
  seller: Seller | null;
  // Quien registro la venta en el sistema (puede ser distinta de la vendedora).
  registeredBy: Seller | null;
  products: SaleProductLine[];
  // Origen de la venta (enum SaleOrigin; null = sin dato) y su detalle (anuncio, cuenta MK, linea).
  origin: string | null;
  originDetail: unknown;
};

export type QuoteStatusCode = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export type QuoteRow = {
  quoteCode: string;
  createdAt: Date;
  status: QuoteStatusCode;
  total: number;
  clientName: string | null;
  seller: Seller | null;
  saleCode: string | null;
};

export type ProductRow = {
  code: string | null;
  name: string;
  categoryName: string | null;
  price: number;
  baseCost: number;
  additionalCost: number;
  isBundle: boolean;
  hiddenFromStore: boolean;
};

// Venta reconocida en el periodo, con su ganancia real (de Balances) y vendedora.
export type CommissionSaleInput = {
  saleCode: string;
  deliveredAt: Date;
  seller: Seller | null;
  profit: number;
};
