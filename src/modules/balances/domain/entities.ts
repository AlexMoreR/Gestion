export type SupplierPayment = {
  id: string;
  saleId: string;
  supplierId: string;
  amount: number;
  transactionReference: string;
  paymentDate: Date;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptName?: string | null;
  createdAt: Date;
};

export type ShippingCost = {
  id: string;
  saleId: string;
  shippingProvider: string;
  amount: number;
  transactionReference: string;
  paymentDate: Date;
  createdAt: Date;
};

export type SaleProfit = {
  saleId: string;
  saleCode: string;
  saleAmount: number;
  supplierCosts: number;
  shippingCosts: number;
  netProfit: number;
  marginPercentage: number;
  createdAt: Date;
  clientName: string | null;
};

export type SupplierBalance = {
  supplierId: string;
  supplierName: string;
  paymentCount: number;
  totalPaid: number;
  lastPaymentAt: Date | null;
  lastSaleCode: string | null;
};

export type DashboardMetrics = {
  salesCount: number;
  salesTotal: number;
  supplierCosts: number;
  shippingCosts: number;
  netProfit: number;
  marginPercentage: number;
  profitableSalesCount: number;
  bestSale: SaleProfit | null;
  worstSale: SaleProfit | null;
};

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type AccountType = "CASH" | "BANK" | "WALLET" | "OTHER";

export type AccountMovementType = "IN" | "OUT" | "TRANSFER";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  reference: string | null;
  isActive: boolean;
  openingBalance: number;
  createdAt: Date;
};

export type AccountBalance = Account & {
  ingreso: number;
  gasto: number;
  movimientos: number;
  balance: number;
};

export type AccountTransactionType = "INCOME" | "EXPENSE" | "MOVEMENT_IN" | "MOVEMENT_OUT";

export type AccountTransaction = {
  id: string;
  date: Date;
  type: AccountTransactionType;
  concept: string;
  reference: string | null;
  // Monto con signo: positivo aumenta el saldo, negativo lo disminuye.
  amount: number;
  receiptUrl: string | null;
  receiptName: string | null;
};

export type PaymentHistoryRow = SupplierPayment & {
  supplierName: string;
  saleCode: string | null;
  saleTotal: number | null;
  accountId: string | null;
};

export type ShippingCostRow = ShippingCost & {
  saleCode: string;
  clientName: string | null;
  accountId: string | null;
};
