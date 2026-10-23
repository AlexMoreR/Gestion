import { describe, expect, it } from "vitest";
import {
  computeAge,
  filterTeam,
  isActiveInMonth,
  isActiveOn,
  isAssignable,
  isIsoDay,
  leftBeforeMonth,
  normalizePersonName,
  payrollTeamEntries,
  teamStatus,
  todayInBogota,
  toPublicMember,
  type TeamMember,
} from "./team-member";

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    id: "m1",
    userId: null,
    fullName: "Persona",
    document: "123",
    birthDate: null,
    phone: "300",
    email: "a@b.co",
    address: "Calle 1",
    emergencyName: "Mamá",
    emergencyPhone: "301",
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

describe("computeAge", () => {
  it("cuenta el cumpleaños desde ese mismo dia", () => {
    expect(computeAge("2000-10-22", "2026-10-22")).toBe(26);
    expect(computeAge("2000-10-23", "2026-10-22")).toBe(25);
    expect(computeAge("2000-11-01", "2026-10-22")).toBe(25);
  });
  it("sin fecha o fecha invalida = sin edad", () => {
    expect(computeAge(null, "2026-10-22")).toBeNull();
    expect(computeAge("2000-02-30", "2026-10-22")).toBeNull();
    expect(computeAge("2030-01-01", "2026-10-22")).toBeNull();
  });
});

describe("estado y fechas", () => {
  const genesis = member({ endDate: "2026-10-20" });
  const emanuel = member({ startDate: "2026-10-15" });

  it("retirado solo cuando ya paso el ultimo dia", () => {
    expect(teamStatus(genesis, "2026-10-20")).toBe("ACTIVO");
    expect(teamStatus(genesis, "2026-10-21")).toBe("RETIRADO");
    expect(teamStatus(member({}), "2030-01-01")).toBe("ACTIVO");
  });

  it("activo en una fecha: ingreso y salida inclusive", () => {
    expect(isActiveOn(emanuel, "2026-10-14")).toBe(false);
    expect(isActiveOn(emanuel, "2026-10-15")).toBe(true);
    expect(isActiveOn(genesis, "2026-10-20")).toBe(true);
    expect(isActiveOn(genesis, "2026-10-21")).toBe(false);
    expect(isActiveOn(member({ startDate: "2026-10-01", endDate: "2026-10-10" }), "2026-10-05")).toBe(true);
  });

  it("activo en el mes si trabajo al menos un dia", () => {
    expect(isActiveInMonth(emanuel, "2026-09")).toBe(false);
    expect(isActiveInMonth(emanuel, "2026-10")).toBe(true);
    expect(isActiveInMonth(genesis, "2026-10")).toBe(true);
    expect(isActiveInMonth(genesis, "2026-11")).toBe(false);
    expect(leftBeforeMonth(genesis, "2026-10")).toBe(false);
    expect(leftBeforeMonth(genesis, "2026-11")).toBe(true);
  });

  it("los retirados no se pueden asignar; sin ficha si", () => {
    expect(isAssignable(genesis, "2026-10-22")).toBe(false);
    expect(isAssignable(emanuel, "2026-10-22")).toBe(true);
    expect(isAssignable(null, "2026-10-22")).toBe(true);
  });

  it("fechas de calendario validas", () => {
    expect(isIsoDay("2026-10-15")).toBe(true);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("15/10/2026")).toBe(false);
  });

  it("hoy en Colombia (UTC-5)", () => {
    expect(todayInBogota(new Date("2026-10-22T03:00:00Z"))).toBe("2026-10-21");
    expect(todayInBogota(new Date("2026-10-22T06:00:00Z"))).toBe("2026-10-22");
  });
});

describe("payrollTeamEntries", () => {
  it("marca quien entra al mes y quien ya habia salido", () => {
    const entries = payrollTeamEntries(
      [member({ id: "g", userId: "u-g", fullName: "Génesis", endDate: "2026-10-20" }), member({ id: "e", fullName: "Emanuel", startDate: "2026-10-15", payType: "DIARIO" })],
      "2026-11",
      "2026-11-02",
    );
    expect(entries[0]).toMatchObject({ activeInMonth: false, leftBeforeMonth: true, status: "RETIRADO" });
    expect(entries[1]).toMatchObject({ activeInMonth: true, leftBeforeMonth: false, status: "ACTIVO", payType: "DIARIO", userId: null });
  });
});

describe("filterTeam y datos publicos", () => {
  const team = [
    member({ id: "a", fullName: "María Camila Ardila" }),
    member({ id: "b", fullName: "Génesis", endDate: "2026-10-20" }),
    member({ id: "c", fullName: "Alexander", isOwner: true }),
    member({ id: "d", fullName: "Emanuel Díaz", payType: "DIARIO" }),
  ];
  it("activos / retirados / todos, dueño primero", () => {
    expect(filterTeam(team, { estado: "activos", q: "", pago: "" }, "2026-10-22").map((m) => m.id)).toEqual(["c", "d", "a"]);
    expect(filterTeam(team, { estado: "retirados", q: "", pago: "" }, "2026-10-22").map((m) => m.id)).toEqual(["b"]);
    expect(filterTeam(team, { estado: "todos", q: "", pago: "" }, "2026-10-22")).toHaveLength(4);
  });
  it("busca sin tildes y filtra por forma de pago", () => {
    expect(filterTeam(team, { estado: "todos", q: "maria", pago: "" }, "2026-10-22").map((m) => m.id)).toEqual(["a"]);
    expect(filterTeam(team, { estado: "todos", q: "", pago: "DIARIO" }, "2026-10-22").map((m) => m.id)).toEqual(["d"]);
    expect(normalizePersonName("  Génesis  SÁNCHEZ ")).toBe("genesis sanchez");
  });
  it("lo publico no lleva datos personales", () => {
    const visible = toPublicMember(team[0]) as Record<string, unknown>;
    for (const key of ["document", "birthDate", "phone", "email", "address", "emergencyName", "emergencyPhone", "notes"]) {
      expect(visible).not.toHaveProperty(key);
    }
  });
});
