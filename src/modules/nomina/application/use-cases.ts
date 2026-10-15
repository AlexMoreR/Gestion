import type { BalancesRepository } from "../../balances/domain/repository";
import { summarizeCashPosition, type CashPosition, type MoneyWithoutAccount } from "../../balances/domain/cash-position";
import { getCommissionsBoardUseCase } from "../../asesor/application/use-cases";
import { buildMonthRange } from "../../asesor/domain/calculations";
import type { AsesorReadRepository } from "../../asesor/domain/repository";
import { buildPayrollBoard, monthKey, type PayrollBoard } from "../domain/payroll";
import type { NominaRepository } from "../infrastructure/prisma-nomina-repository";

export type NominaDependencies = {
  balances: BalancesRepository;
  asesor: AsesorReadRepository;
  nomina: NominaRepository;
};

// Nomina del mes: base (salario) + comision (misma regla de /admin/comisiones) - pagado.
export async function getPayrollBoardUseCase(deps: NominaDependencies, mes: number, anio: number): Promise<PayrollBoard> {
  const period = buildMonthRange(mes, anio);
  const [config, staff, payments, commissions] = await Promise.all([
    deps.nomina.getConfig(),
    deps.nomina.listStaff(),
    deps.nomina.listPayments(period, monthKey(mes, anio)),
    getCommissionsBoardUseCase({ balances: deps.balances, asesor: deps.asesor }, mes, anio),
  ]);
  return buildPayrollBoard({
    mes,
    anio,
    config,
    staff,
    payments,
    commissions: commissions.sellers.map((seller) => ({
      userId: seller.sellerId,
      name: seller.name,
      salesCount: seller.salesCount,
      commission: seller.commission,
    })),
  });
}

// Dinero de hoy: saldo actual por cuenta y por tipo (efectivo, bancos, billeteras).
export async function getCashPositionUseCase(
  balances: BalancesRepository,
  loadMoneyWithoutAccount: () => Promise<MoneyWithoutAccount>,
): Promise<CashPosition> {
  const [allTime, withoutAccount] = await Promise.all([balances.listAccountBalances(), loadMoneyWithoutAccount()]);
  return summarizeCashPosition(allTime, withoutAccount);
}
