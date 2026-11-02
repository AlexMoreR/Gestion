// Modulo "asesor": consultas de SOLO LECTURA para el asesor de IA (servidor MCP).
// Tipos planos, sin Prisma.
import type { SaleLedgerInput } from "./payments";
import type { ProductSource } from "./product-source";

// Un gasto operativo para el asesor (listar_gastos).
export type ExpenseLine = {
  id: string;
  date: Date;
  category: string;
  account: string;
  amount: number;
  note: string | null;
  person: string | null;
  hasReceipt: boolean;
};

export type DayRange = {
  // Semiabierto [from, to): misma convencion que Balances (dias calendario en UTC).
  from: Date;
  to: Date;
};

export type Seller = {
  id: string;
  name: string;
  // Rol del usuario (ADMIN/EMPLEADO/CLIENTE) cuando se conoce. Sirve para marcar
  // en la pantalla de Comisiones las cotizaciones creadas por el dueño/admin.
  role?: string | null;
};

// De donde sale el costo: confirmado con la proveedora, inventario (stock: costo base + flete del
// producto), estimado del catalogo (fabricacion sin confirmar) o sin dato (0).
export type SaleProductCostOrigin = "confirmado" | "inventario" | "estimado de catálogo" | "sin dato";

// De donde salen los productos de la venta: la orden o, si no tiene items, la cotizacion.
export type SaleProductsSource = "orden" | "cotizacion" | "ninguna";

export type SaleProductLine = {
  nombre: string;
  codigo: string | null;
  cantidad: number;
  color: string | null;
  precio_unitario: number;
  total_linea: number;
  costo_unitario: number;
  costo_origen: SaleProductCostOrigin;
};

// Lista corta de productos de una cotizacion (sin precios ni costos).
export type QuoteProductSummary = {
  nombre: string;
  codigo: string | null;
  color: string | null;
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
  productsSource: SaleProductsSource;
  // Origen de la venta (enum SaleOrigin; null = sin dato) y su detalle (anuncio, cuenta MK, linea).
  origin: string | null;
  originDetail: unknown;
  // Si salio de stock o por fabricacion (con OF y proveedora), segun lo marcado en la orden.
  productSource: ProductSource;
  // Tokens de los enlaces publicos (cotizacion, venta y ordenes de fabricacion de la proveedora).
  quoteShareToken: string | null;
  invoiceToken: string | null;
  // Ordenes de fabricacion (OF) de la orden; vacio si no hay orden o no tiene OF.
  manufacturingOrders: { code: string; supplierName: string; shareToken: string }[];
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
  shareToken: string | null;
  saleInvoiceToken: string | null;
  products: QuoteProductSummary[];
};

export type ProductRow = {
  id: string;
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
  recognizedAt: Date;
  seller: Seller | null;
  profit: number;
};

// Venta del mes con los datos que muestra la pantalla de Comisiones del admin.
export type CommissionBoardSaleInput = CommissionSaleInput & {
  clientName: string | null;
  saleAmount: number;
  pendingDelivery: boolean;
};

// Movimiento de la cuenta de una proveedora (deuda_con_proveedoras).
export type SupplierLedgerLine = {
  type: "CHARGE" | "PAYMENT";
  amount: number;
  orderId: string | null;
  // Fecha del pago escrita (o del registro), igual que la pantalla Proveedores.
  date: Date;
  accountName: string | null;
  note: string | null;
};

// Orden de venta con lo que se le encargo a esa proveedora.
export type SupplierOrderInfo = {
  orderId: string;
  orderCode: string;
  // Orden de fabricacion (OF-...) de esa proveedora en esa orden; null si no se creo.
  manufacturingCode: string | null;
  // Fecha de la OF (o de la orden si no hay OF): es la que filtra por fechas.
  date: Date;
  saleCode: string | null;
  clientName: string | null;
  products: { nombre: string; cantidad: number; color: string | null }[];
};

export type SupplierLedger = {
  supplierId: string;
  name: string;
  entries: SupplierLedgerLine[];
  orders: SupplierOrderInfo[];
};

// Un pedido (venta no cancelada con su orden) para buscar_pedido y pedidos_abiertos.
// La plata sale de "ledger" con buildSaleLedger, igual que listar_ventas y ver_venta.
export type OrderTracking = {
  ledger: SaleLedgerInput;
  orderCode: string | null;
  orderCreatedAt: Date | null;
  // Ficha de la clienta; null = no esta guardado.
  clientPhone: string | null;
  city: string | null;
  department: string | null;
  products: QuoteProductSummary[];
  manufacturingOrders: { code: string; supplierName: string }[];
  // Historial de estados de la orden.
  statusChanges: { toStatus: string; at: Date }[];
  dispatches: {
    code: string;
    carrierName: string | null;
    trackingNumber: string | null;
    shippingAddress: string | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  }[];
};
