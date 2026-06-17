import type {
  BalancesRepository,
  CreateShippingCostInput,
  CreateSupplierPaymentInput,
  ListBalancesQuery,
  UpdateShippingCostInput,
  UpdateSupplierPaymentInput,
} from "../domain/repository";

export async function createSupplierPaymentUseCase(
  repository: BalancesRepository,
  input: CreateSupplierPaymentInput,
) {
  return repository.createSupplierPayment(input);
}

export async function updateSupplierPaymentUseCase(
  repository: BalancesRepository,
  paymentId: string,
  input: UpdateSupplierPaymentInput,
) {
  return repository.updateSupplierPayment(paymentId, input);
}

export async function deleteSupplierPaymentUseCase(repository: BalancesRepository, paymentId: string) {
  return repository.deleteSupplierPayment(paymentId);
}

export async function createShippingCostUseCase(
  repository: BalancesRepository,
  input: CreateShippingCostInput,
) {
  return repository.createShippingCost(input);
}

export async function updateShippingCostUseCase(
  repository: BalancesRepository,
  costId: string,
  input: UpdateShippingCostInput,
) {
  return repository.updateShippingCost(costId, input);
}

export async function deleteShippingCostUseCase(repository: BalancesRepository, costId: string) {
  return repository.deleteShippingCost(costId);
}

export async function calculateSaleProfitUseCase(repository: BalancesRepository, saleId: string) {
  return repository.calculateSaleProfit(saleId);
}

export async function getSupplierBalanceUseCase(repository: BalancesRepository) {
  return repository.listSupplierBalances();
}

export async function getDashboardMetricsUseCase(repository: BalancesRepository) {
  return repository.getDashboardMetrics();
}

export async function getProfitReportUseCase(repository: BalancesRepository, query: ListBalancesQuery) {
  return repository.listProfitReport(query);
}
