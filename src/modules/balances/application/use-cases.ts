import type {
  BalancesRepository,
  CreateAccountInput,
  CreateAccountMovementInput,
  CreateShippingCostInput,
  CreateSupplierPaymentInput,
  ListBalancesQuery,
  UpdateAccountInput,
  UpdateShippingCostInput,
  UpdateSupplierPaymentInput,
} from "../domain/repository";
import type { DateRange } from "../domain/entities";
import { currentAccountBalance } from "../domain/cash-position";
import { negativeBalanceNotice } from "../domain/negative-balance";

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

export async function getDashboardMetricsUseCase(repository: BalancesRepository, period?: DateRange) {
  return repository.getDashboardMetrics(period);
}

export async function getProfitReportUseCase(repository: BalancesRepository, query: ListBalancesQuery) {
  return repository.listProfitReport(query);
}

export async function listAccountsUseCase(repository: BalancesRepository, options?: { activeOnly?: boolean; includeOwner?: boolean }) {
  return repository.listAccounts(options);
}

export async function listAccountBalancesUseCase(repository: BalancesRepository) {
  return repository.listAccountBalances();
}

// Llamar DESPUES de guardar: suma "Ojo: <cuenta> quedó en −$X" al mensaje si la cuenta quedó bajo cero.
export async function withNegativeBalanceNotice(
  repository: BalancesRepository,
  message: string,
  accountId: string | null | undefined,
): Promise<string> {
  if (!accountId) return message;
  try {
    const account = await repository.getAccountBalance(accountId);
    const notice = account ? negativeBalanceNotice(account.name, currentAccountBalance(account)) : "";
    return notice ? `${message}. ${notice}` : message;
  } catch {
    // El registro ya se guardó: si falla el saldo, se muestra el mensaje de siempre (sin error que invite a repetir).
    return message;
  }
}

export async function listAccountTransactionsUseCase(repository: BalancesRepository, accountId: string) {
  return repository.listAccountTransactions(accountId);
}

export async function createAccountUseCase(repository: BalancesRepository, input: CreateAccountInput) {
  return repository.createAccount(input);
}

export async function updateAccountUseCase(
  repository: BalancesRepository,
  accountId: string,
  input: UpdateAccountInput,
) {
  return repository.updateAccount(accountId, input);
}

export async function createAccountMovementUseCase(
  repository: BalancesRepository,
  input: CreateAccountMovementInput,
) {
  return repository.createAccountMovement(input);
}
