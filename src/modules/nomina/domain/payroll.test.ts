import { describe, expect, it } from "vitest";
import { belongsToPayrollMonth, buildPayrollBoard, fixedCommissionRates, computeMonthlyBase, parsePayrollConfig, type PayrollConfig } from "./payroll";

const config: PayrollConfig = {
  trm: 4000,
  people: [
    { userId: "maria", baseAmount: 50, currency: "USD", period: "QUINCENAL", earnsCommission: true, commissionPct: 15, commissionFrom: "2026-10" },
    { userId: "ingrid", baseAmount: 0, currency: "COP", period: "SIN_BASE", earnsCommission: true, commissionPct: null, commissionFrom: null },
    { userId: "emanuel", baseAmount: 50000, currency: "COP", period: "DIARIO", earnsCommission: false, commissionPct: null, commissionFrom: null },
  ],
  daysByMonth: { "2026-10": { emanuel: 3 } },
};

describe("computeMonthlyBase", () => {
  it("quincenal en USD = 2 quincenas x TRM", () => {
    expect(computeMonthlyBase(config.people[0], 4000, null)).toEqual({ units: 2, original: 100, cop: 400000, missing: null });
  });
  it("sin TRM no inventa la conversion", () => {
    expect(computeMonthlyBase(config.people[0], null, null)).toMatchObject({ cop: null, missing: "trm" });
  });
  it("diario = tarifa x dias; sin dias queda pendiente", () => {
    expect(computeMonthlyBase(config.people[2], null, 3).cop).toBe(150000);
    expect(computeMonthlyBase(config.people[2], null, null).missing).toBe("dias");
  });
  it("sin basico = 0", () => {
    expect(computeMonthlyBase(config.people[1], null, null).cop).toBe(0);
  });
});

describe("buildPayrollBoard", () => {
  const board = buildPayrollBoard({
    mes: 10,
    anio: 2026,
    config,
    staff: [
      { id: "maria", name: "María" },
      { id: "ingrid", name: "Ingrid" },
      { id: "emanuel", name: "Emanuel" },
      { id: "genesis", name: "Génesis" },
    ],
    commissions: [
      { userId: "maria", name: "María", salesCount: 2, commission: 74250 },
      { userId: "ingrid", name: "Ingrid", salesCount: 2, commission: 53750 },
    ],
    payments: [
      { id: "p1", employeeId: "maria", amount: 200000, date: new Date("2026-10-15T12:00:00Z"), description: null, accountName: "Caja" },
    ],
  });

  it("suma base + comision y resta lo pagado", () => {
    const maria = board.rows.find((row) => row.userId === "maria")!;
    expect(maria.totalDue).toBe(474250);
    expect(maria.paid).toBe(200000);
    expect(maria.pending).toBe(274250);
  });

  it("solo comision para quien no tiene basico", () => {
    expect(board.rows.find((row) => row.userId === "ingrid")!.pending).toBe(53750);
  });

  it("dias trabajados para el pago diario", () => {
    expect(board.rows.find((row) => row.userId === "emanuel")!.totalDue).toBe(150000);
  });

  it("totales del mes", () => {
    expect(board.totals).toMatchObject({ due: 678000, paid: 200000, pending: 478000, incomplete: false });
  });
});

describe("parsePayrollConfig", () => {
  it("tolera JSON roto o vacio", () => {
    expect(parsePayrollConfig("no-json").people).toEqual([]);
    expect(parsePayrollConfig(null).trm).toBeNull();
  });
  it("descarta datos invalidos y duplicados", () => {
    const parsed = parsePayrollConfig(
      JSON.stringify({
        trm: "3900",
        people: [
          { userId: "a", baseAmount: 50, currency: "USD", period: "QUINCENAL" },
          { userId: "a", baseAmount: 99, currency: "COP", period: "DIARIO" },
          { userId: "b", period: "RARO", currency: "EUR" },
        ],
        daysByMonth: { "2026-10": { c: 4, d: 99 }, mal: { c: 1 } },
      }),
    );
    expect(parsed.trm).toBe(3900);
    expect(parsed.people).toHaveLength(2);
    expect(parsed.people[1]).toMatchObject({ period: "SIN_BASE", currency: "COP", baseAmount: 0 });
    expect(parsed.daysByMonth).toEqual({ "2026-10": { c: 4 } });
  });
});

describe("belongsToPayrollMonth", () => {
  const october = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-11-01T00:00:00Z") };
  const paidOct3 = new Date("2026-10-03T12:00:00Z");
  it("un pago marcado con su mes cuenta en ese mes aunque se pague despues", () => {
    expect(belongsToPayrollMonth("Nómina Ingrid: Comisiones · 2026-09", paidOct3, "2026-09", { from: new Date("2026-09-01T00:00:00Z"), to: october.from })).toBe(true);
    expect(belongsToPayrollMonth("Nómina Ingrid: Comisiones · 2026-09", paidOct3, "2026-10", october)).toBe(false);
  });
  it("sin marca cuenta por su fecha", () => {
    expect(belongsToPayrollMonth("Pago a mano", paidOct3, "2026-10", october)).toBe(true);
    expect(belongsToPayrollMonth(null, new Date("2026-09-30T12:00:00Z"), "2026-10", october)).toBe(false);
  });
});

describe("fixedCommissionRates", () => {
  it("aplica la comision fija desde su mes", () => {
    expect(fixedCommissionRates(config, 10, 2026)).toEqual({ maria: 0.15 });
    expect(fixedCommissionRates(config, 9, 2026)).toEqual({});
    expect(fixedCommissionRates(config, 1, 2027)).toEqual({ maria: 0.15 });
  });
});
