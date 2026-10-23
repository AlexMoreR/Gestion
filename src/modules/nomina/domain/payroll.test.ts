import { describe, expect, it } from "vitest";
import { belongsToPayrollMonth, buildPayrollBoard, fixedCommissionRates, computeMonthlyBase, monthKey, parsePayrollConfig, type PayrollConfig } from "./payroll";
import { payrollTeamEntries, type TeamMember } from "../../equipo/domain/team-member";

function teamMember(overrides: Partial<TeamMember>): TeamMember {
  return {
    id: "t",
    userId: null,
    fullName: "Persona",
    document: null,
    birthDate: null,
    phone: null,
    email: null,
    address: null,
    emergencyName: null,
    emergencyPhone: null,
    jobTitle: null,
    isOwner: false,
    employmentType: "FREELANCE",
    payType: null,
    startDate: null,
    endDate: null,
    exitReason: null,
    notes: null,
    ...overrides,
  };
}

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

describe("buildPayrollBoard con el Equipo", () => {
  // Como produccion hoy: sin salarios configurados, solo comisiones de Ingrid y Maria Camila.
  const emptyConfig: PayrollConfig = { trm: null, people: [], daysByMonth: {} };
  const staff = [
    { id: "ingrid", name: "Ingrid Sánchez" },
    { id: "maria", name: "María Camila Ardila" },
    { id: "alex", name: "Alexander" },
    { id: "genesis", name: "Génesis" },
  ];
  const commissions = [
    { userId: "ingrid", name: "Ingrid Sánchez", salesCount: 3, commission: 127050 },
    { userId: "maria", name: "María Camila Ardila", salesCount: 2, commission: 64500 },
  ];
  const members: TeamMember[] = [
    teamMember({ id: "t-ingrid", userId: "ingrid", fullName: "Ingrid Sánchez" }),
    teamMember({ id: "t-maria", userId: "maria", fullName: "María Camila Ardila" }),
    teamMember({ id: "t-alex", userId: "alex", fullName: "Alexander", isOwner: true }),
    teamMember({ id: "t-emanuel", userId: null, fullName: "Emanuel Díaz", startDate: "2026-10-15", payType: "DIARIO" }),
    teamMember({ id: "t-genesis", userId: "genesis", fullName: "Génesis", endDate: "2026-10-20" }),
  ];
  const board = (month: { mes: number; anio: number }, extra: Partial<Parameters<typeof buildPayrollBoard>[0]> = {}) =>
    buildPayrollBoard({
      ...month,
      config: emptyConfig,
      staff,
      commissions,
      payments: [],
      team: payrollTeamEntries(members, monthKey(month.mes, month.anio), "2026-10-22"),
      ...extra,
    });

  it("octubre: aparecen todos los activos del mes y la retirada de ese mes", () => {
    const october = board({ mes: 10, anio: 2026 });
    expect(october.rows.map((row) => row.name).sort()).toEqual(
      ["Alexander", "Emanuel Díaz", "Génesis", "Ingrid Sánchez", "María Camila Ardila"],
    );
    const emanuel = october.rows.find((row) => row.name === "Emanuel Díaz")!;
    expect(emanuel).toMatchObject({ userId: "team:t-emanuel", hasUser: false, teamStatus: "ACTIVO", commission: 0 });
    expect(october.rows.find((row) => row.userId === "genesis")).toMatchObject({ teamStatus: "RETIRADO", endDate: "2026-10-20" });
    expect(october.rows.find((row) => row.userId === "ingrid")!.commission).toBe(127050);
    expect(october.rows.find((row) => row.userId === "maria")!.commission).toBe(64500);
  });

  it("los totales no cambian por agregar el equipo (meses viejos iguales)", () => {
    for (const month of [{ mes: 8, anio: 2026 }, { mes: 9, anio: 2026 }, { mes: 10, anio: 2026 }]) {
      const before = buildPayrollBoard({ ...month, config: emptyConfig, staff, commissions, payments: [] });
      const after = board(month);
      expect(after.totals).toEqual(before.totals);
      for (const row of before.rows) {
        expect(after.rows.find((item) => item.userId === row.userId)).toMatchObject({
          commission: row.commission,
          totalDue: row.totalDue,
          pending: row.pending,
        });
      }
    }
  });

  it("septiembre: Emanuel todavia no habia entrado", () => {
    expect(board({ mes: 9, anio: 2026 }).rows.some((row) => row.name === "Emanuel Díaz")).toBe(false);
  });

  it("despues de su mes de salida el retirado no aparece, salvo comision o pagos", () => {
    const november = board({ mes: 11, anio: 2026 }, { commissions: [] });
    expect(november.rows.some((row) => row.userId === "genesis")).toBe(false);

    const withCommission = board({ mes: 11, anio: 2026 }, {
      commissions: [{ userId: "genesis", name: "Génesis", salesCount: 1, commission: 30000 }],
    });
    const genesis = withCommission.rows.find((row) => row.userId === "genesis")!;
    expect(genesis.commission).toBe(30000);
    expect(genesis.warnings.some((warning) => warning.startsWith("Retirado/a desde 2026-10-20"))).toBe(true);

    const withPayment = board({ mes: 11, anio: 2026 }, {
      commissions: [],
      payments: [{ id: "p", employeeId: "genesis", amount: 10000, date: new Date("2026-11-05T12:00:00Z"), description: null, accountName: "Caja" }],
    });
    expect(withPayment.rows.find((row) => row.userId === "genesis")!.paid).toBe(10000);
  });

  it("un retirado configurado en Nomina tampoco cobra basico despues de su mes", () => {
    const configured: PayrollConfig = {
      trm: null,
      people: [{ userId: "genesis", baseAmount: 500000, currency: "COP", period: "QUINCENAL", earnsCommission: true, commissionPct: null, commissionFrom: null }],
      daysByMonth: {},
    };
    expect(board({ mes: 11, anio: 2026 }, { config: configured, commissions: [] }).rows.some((row) => row.userId === "genesis")).toBe(false);
    expect(board({ mes: 10, anio: 2026 }, { config: configured }).rows.find((row) => row.userId === "genesis")!.baseCop).toBe(1000000);
  });

  it("avisa la forma de pago de la ficha si no hay salario o si no coincide", () => {
    const withUser = members.map((item) => (item.id === "t-emanuel" ? { ...item, userId: "emanuel" } : item));
    const october = buildPayrollBoard({
      mes: 10,
      anio: 2026,
      config: {
        trm: null,
        people: [{ userId: "alex", baseAmount: 100000, currency: "COP", period: "QUINCENAL", earnsCommission: false, commissionPct: null, commissionFrom: null }],
        daysByMonth: {},
      },
      staff: [...staff, { id: "emanuel", name: "Emanuel Díaz" }],
      commissions,
      payments: [],
      team: payrollTeamEntries(
        withUser.map((item) => (item.id === "t-alex" ? { ...item, payType: "SOLO_COMISION" as const } : item)),
        "2026-10",
        "2026-10-22",
      ),
    });
    expect(october.rows.find((row) => row.userId === "emanuel")!.warnings[0]).toContain("Por día");
    expect(october.rows.find((row) => row.userId === "alex")!.warnings[0]).toContain("Solo comisión");
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
