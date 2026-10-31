import type { BalancesRepository } from "../../balances/domain/repository";
import { summarizeCashPosition, type CashPosition, type MoneyWithoutAccount } from "../../balances/domain/cash-position";
import { getCommissionsBoardUseCase } from "../../asesor/application/use-cases";
import { buildMonthRange } from "../../asesor/domain/calculations";
import type { AsesorReadRepository } from "../../asesor/domain/repository";
import { buildPayrollBoard, fixedCommissionRates, monthKey, type PayrollBoard } from "../domain/payroll";
import type { NominaRepository } from "../infrastructure/prisma-nomina-repository";
import { payrollTeamEntries, todayInBogota, type TeamMember } from "../../equipo/domain/team-member";
import type { DateRange } from "../../balances/domain/entities";
import {
  buildPortalQuotes,
  nextSaleRate,
  ruleText,
  type PortalQuoteInput,
  type PortalQuoteLine,
  type PortalSaleLine,
} from "../domain/seller-portal";

export type NominaDependencies = {
  balances: BalancesRepository;
  asesor: AsesorReadRepository;
  nomina: NominaRepository;
  // Fichas de Equipo: activos del mes entran aunque no tengan salario; retirados salen despues de su mes.
  loadTeam?: () => Promise<TeamMember[]>;
};

// Nomina del mes: base (salario) + comision (misma regla de /admin/comisiones) - pagado.
export async function getPayrollBoardUseCase(deps: NominaDependencies, mes: number, anio: number): Promise<PayrollBoard> {
  const period = buildMonthRange(mes, anio);
  const config = await deps.nomina.getConfig();
  const [staff, payments, commissions, team] = await Promise.all([
    deps.nomina.listStaff(),
    deps.nomina.listPayments(period, monthKey(mes, anio)),
    getCommissionsBoardUseCase(
      {
        balances: deps.balances,
        asesor: deps.asesor,
        loadFixedCommissionRates: async (m, a) => fixedCommissionRates(config, m, a),
      },
      mes,
      anio,
    ),
    deps.loadTeam ? deps.loadTeam() : Promise.resolve([]),
  ]);
  return buildPayrollBoard({
    mes,
    anio,
    config,
    staff,
    payments,
    team: payrollTeamEntries(team, monthKey(mes, anio), todayInBogota()),
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

export type SellerPortal = {
  mes: number;
  anio: number;
  fixedRatePct: number | null;
  rule: string;
  sales: PortalSaleLine[];
  totals: { salesCount: number; saleAmount: number; commission: number; pendingDeliveryCount: number };
  nextRatePct: number;
  quotes: PortalQuoteLine[];
  potentialCommission: number;
};

// Lo que ve la asesora en su link privado: sus ventas del mes con la comision explicada y sus
// cotizaciones abiertas con lo que ganaria si las cierra. Misma regla y mismas ventas de Comisiones.
export async function getSellerPortalUseCase(
  deps: NominaDependencies & { listOpenQuotes: (sellerId: string, period: DateRange) => Promise<PortalQuoteInput[]> },
  sellerId: string,
  mes: number,
  anio: number,
): Promise<SellerPortal> {
  const period = buildMonthRange(mes, anio);
  const config = await deps.nomina.getConfig();
  const rates = fixedCommissionRates(config, mes, anio);
  const fixedRate = typeof rates[sellerId] === "number" ? rates[sellerId] : null;
  const [board, openQuotes] = await Promise.all([
    getCommissionsBoardUseCase(
      { balances: deps.balances, asesor: deps.asesor, loadFixedCommissionRates: async () => rates },
      mes,
      anio,
    ),
    deps.listOpenQuotes(sellerId, period),
  ]);
  const seller = board.sellers.find((item) => item.sellerId === sellerId) ?? null;
  const sales: PortalSaleLine[] = (seller?.lines ?? []).map((line) => ({
    saleCode: line.saleCode,
    day: line.recognizedDay,
    clientName: line.clientName,
    saleAmount: line.saleAmount,
    profit: line.profit,
    ratePct: line.ratePct,
    commission: line.commission,
    pendingDelivery: line.pendingDelivery,
    noCommission: line.note !== null,
  }));
  const nextRate = nextSaleRate(sales.length, fixedRate);
  const quotes = buildPortalQuotes(openQuotes, nextRate);
  return {
    mes,
    anio,
    fixedRatePct: fixedRate === null ? null : Math.round(fixedRate * 10000) / 100,
    rule: ruleText(fixedRate === null ? null : Math.round(fixedRate * 10000) / 100),
    sales,
    totals: {
      salesCount: sales.length,
      saleAmount: seller?.saleAmount ?? 0,
      commission: seller?.commission ?? 0,
      pendingDeliveryCount: seller?.pendingDeliveryCount ?? 0,
    },
    nextRatePct: Math.round(nextRate * 10000) / 100,
    quotes,
    potentialCommission: quotes.reduce((sum, quote) => sum + quote.estimatedCommission, 0),
  };
}
