import type {
  DashboardMetrics,
  PagedResult,
  PaymentHistoryRow,
  SaleProfit,
  ShippingCost,
  ShippingCostRow,
  SupplierBalance,
  SupplierPayment,
} from "./entities";

export type ListBalancesQuery = {
  search?: string;
  page: number;
  pageSize: number;
  sortBy?: "date" | "supplier" | "sale" | "reference" | "amount";
  sortDirection?: "asc" | "desc";
};

export type CreateSupplierPaymentInput = {
  saleId: string;
  supplierId: string;
  amount: number;
  transactionReference: string;
  paymentDate: Date;
  notes?: string | null;
  createdById: string;
};

export type UpdateSupplierPaymentInput = Omit<CreateSupplierPaymentInput, "createdById">;

export type CreateShippingCostInput = {
  saleId: string;
  shippingProvider: string;
  amount: number;
  transactionReference: string;
  paymentDate: Date;
  createdById: string;
};

export type UpdateShippingCostInput = Omit<CreateShippingCostInput, "createdById">;

export interface BalancesRepository {
  listSupplierPayments(query: ListBalancesQuery): Promise<PagedResult<PaymentHistoryRow>>;
  getSupplierPayment(paymentId: string): Promise<PaymentHistoryRow | null>;
  createSupplierPayment(input: CreateSupplierPaymentInput): Promise<SupplierPayment>;
  updateSupplierPayment(paymentId: string, input: UpdateSupplierPaymentInput): Promise<SupplierPayment>;
  deleteSupplierPayment(paymentId: string): Promise<void>;

  listShippingCosts(query: ListBalancesQuery): Promise<PagedResult<ShippingCostRow>>;
  getShippingCost(costId: string): Promise<ShippingCost | null>;
  createShippingCost(input: CreateShippingCostInput): Promise<ShippingCost>;
  updateShippingCost(costId: string, input: UpdateShippingCostInput): Promise<ShippingCost>;
  deleteShippingCost(costId: string): Promise<void>;

  calculateSaleProfit(saleId: string): Promise<SaleProfit | null>;
  listProfitReport(query: ListBalancesQuery): Promise<PagedResult<SaleProfit>>;
  listSupplierBalances(): Promise<SupplierBalance[]>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
}
