import { describe, expect, it } from "vitest";
import { INITIAL_TEAM, matchStaffUser, planInitialTeam } from "./seed";

const staff = [
  { id: "u-alex", name: "Alexander Moreno", email: "alex@magilus.com" },
  { id: "u-ingrid", name: "Ingrid Sanchez", email: "ingrid@magilus.com" },
  { id: "u-maria", name: "María Camila Ardila", email: "maria@magilus.com" },
  { id: "u-otra", name: null, email: "otra@magilus.com" },
];

describe("matchStaffUser", () => {
  it("une solo si el nombre coincide sin dudas (sin tildes)", () => {
    expect(matchStaffUser("Alexander", staff)).toBe("u-alex");
    expect(matchStaffUser("Ingrid Sánchez", staff)).toBe("u-ingrid");
    expect(matchStaffUser("María Camila Ardila", staff)).toBe("u-maria");
    expect(matchStaffUser("Emanuel Díaz", staff)).toBeNull();
  });
  it("no une si hay dos posibles o el apellido no coincide", () => {
    const twins = [...staff, { id: "u-maria2", name: "María Camila Pérez", email: "m2@magilus.com" }];
    expect(matchStaffUser("María Camila", twins)).toBeNull();
    expect(matchStaffUser("Ingrid Gómez", staff)).toBeNull();
  });
});

describe("planInitialTeam", () => {
  it("carga a las 5 personas con sus fechas y los usuarios que coinciden", () => {
    const plan = planInitialTeam([], staff);
    expect(plan).toHaveLength(5);
    expect(plan.find((p) => p.fullName === "Emanuel Díaz")).toMatchObject({ startDate: "2026-10-15", payType: "DIARIO", userId: null });
    expect(plan.find((p) => p.fullName === "Génesis")).toMatchObject({ endDate: "2026-10-20", userId: null });
    expect(plan.find((p) => p.fullName === "Alexander")).toMatchObject({ isOwner: true, userId: "u-alex" });
  });

  it("correrla dos veces no duplica a nadie", () => {
    const first = planInitialTeam([], staff);
    const second = planInitialTeam(first.map((p) => ({ nameKey: p.nameKey, userId: p.userId })), staff);
    expect(second).toEqual([]);
  });

  it("un usuario ya unido a otra ficha no se vuelve a unir", () => {
    const plan = planInitialTeam([{ nameKey: "otra persona", userId: "u-ingrid" }], staff, INITIAL_TEAM);
    expect(plan.find((p) => p.fullName === "Ingrid Sánchez")?.userId).toBeNull();
  });
});
