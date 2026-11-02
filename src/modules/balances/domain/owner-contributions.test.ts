import { describe, expect, it } from "vitest";
import { summarizeOwnerContributions, type OwnerContributionExpense } from "./owner-contributions";

const gasto = (id: string, iso: string, amount: number): OwnerContributionExpense => ({
  id,
  date: new Date(iso),
  amount,
  categoryName: "Arriendo",
  note: null,
});

describe("aportes del dueño por mes", () => {
  it("un gasto el 31 a las 23:00 (Colombia) se queda en ese mes", () => {
    // 31-oct 23:00 en Bogotá = 1-nov 04:00Z
    const meses = summarizeOwnerContributions([gasto("a", "2026-11-01T04:00:00Z", 1000000)]);
    expect(meses.map((m) => m.month)).toEqual(["2026-10"]);
  });

  it("suma por mes, el mes más reciente primero, y una fecha escrita vale su día", () => {
    const meses = summarizeOwnerContributions([
      gasto("a", "2026-10-05T00:00:00Z", 1000000),
      gasto("b", "2026-10-20T15:00:00Z", 250000.5),
      gasto("c", "2026-11-01T00:00:00Z", 80000),
    ]);
    expect(meses).toHaveLength(2);
    expect(meses[0]).toMatchObject({ month: "2026-11", total: 80000 });
    expect(meses[1].month).toBe("2026-10");
    expect(meses[1].total).toBe(1250000.5);
    expect(meses[1].expenses.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("sin gastos no hay meses", () => {
    expect(summarizeOwnerContributions([])).toEqual([]);
  });
});
