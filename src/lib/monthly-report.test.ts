import { describe, expect, it, vi } from "vitest";

// El informe importa Prisma y Balances; para probar solo las fechas se reemplazan.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/modules/balances/infrastructure/prisma-balances-repository", () => ({ createPrismaBalancesRepository: () => ({}) }));

import { monthRange, previousMonthKey } from "./monthly-report";

describe("fechas del informe mensual (corte en Colombia)", () => {
  it("el mes va de 00:00 Colombia del dia 1 a la medianoche del mes siguiente", () => {
    const range = monthRange("2026-11");
    expect(range?.from.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(range?.to.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(monthRange("2026-13")).toBeNull();
  });

  it("el mes anterior se decide con el dia en Colombia", () => {
    // 31-oct a las 10 p. m. en Colombia: el mes en curso es octubre.
    expect(previousMonthKey(new Date("2026-11-01T03:00:00Z"))).toBe("2026-09");
    expect(previousMonthKey(new Date("2026-11-01T05:00:00Z"))).toBe("2026-10");
    expect(previousMonthKey(new Date("2026-12-01T05:00:00Z"))).toBe("2026-11");
    expect(previousMonthKey(new Date("2027-01-01T05:00:00Z"))).toBe("2026-12");
  });
});
