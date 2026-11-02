import { describe, expect, it } from "vitest";
import {
  closeReminderMessage,
  confirmMonthClose,
  describeMonthClose,
  isLastDayOfMonth,
  lastDayOfMonth,
  MonthCloseInputError,
  type MonthCloseDeps,
  planMonthClose,
  prepareMonthClose,
  resolveCloseMonth,
} from "./close-month";

const ACCOUNTS = [
  { id: "a1", name: "Efectivo", balance: 100_000 },
  { id: "a2", name: "Bancolombia", balance: 2_000_000 },
  { id: "a3", name: "Nequi", balance: 50_000 },
];

function fakeDeps(closed: string[] = []) {
  const saved: Parameters<MonthCloseDeps["saveClose"]>[0][] = [];
  const closedIds = new Set(closed);
  const deps: MonthCloseDeps = {
    loadAccounts: async () => ACCOUNTS,
    findClosedAccountIds: async () => new Set(closedIds),
    saveClose: async (input) => {
      saved.push(input);
      const skipped = input.accountIds.filter((id) => closedIds.has(id));
      input.accountIds.forEach((id) => closedIds.add(id));
      return { skippedAccountIds: skipped };
    },
  };
  return { deps, saved };
}

describe("mes a cerrar", () => {
  it("ultimo dia del mes", () => {
    expect(lastDayOfMonth("2026-10")).toBe("2026-10-31");
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
    expect(isLastDayOfMonth("2026-11-30")).toBe(true);
    expect(isLastDayOfMonth("2026-11-29")).toBe(false);
  });

  it("por defecto el actual si hoy es su ultimo dia, si no el anterior", () => {
    expect(resolveCloseMonth(undefined, "2026-10-31")).toBe("2026-10");
    expect(resolveCloseMonth(undefined, "2026-11-02")).toBe("2026-10");
    expect(resolveCloseMonth(undefined, "2027-01-05")).toBe("2026-12");
  });

  it("rechaza el mes que no ha terminado, meses viejos y formato malo", () => {
    expect(() => resolveCloseMonth("2026-11", "2026-11-02")).toThrow(MonthCloseInputError);
    expect(() => resolveCloseMonth("2026-08", "2026-11-02")).toThrow(MonthCloseInputError);
    expect(() => resolveCloseMonth("2026-13", "2026-11-02")).toThrow(MonthCloseInputError);
    expect(resolveCloseMonth("2026-10", "2026-11-02")).toBe("2026-10");
  });
});

describe("planMonthClose", () => {
  const base = { monthKey: "2026-10", accounts: ACCOUNTS, closedAccountIds: new Set<string>() };

  it("cuadra sin movimiento", () => {
    const plan = planMonthClose({ ...base, dictated: [{ cuenta: "efectivo", saldo: 100_000 }] });
    expect(plan.lines[0]).toMatchObject({ estado: "cuadro", diferencia: 0 });
    expect(plan.faltan).toEqual(["Bancolombia", "Nequi"]);
  });

  it("falta plata (IN) y sobra plata (OUT)", async () => {
    const { deps, saved } = fakeDeps();
    const plan = await confirmMonthClose(
      deps,
      {
        saldos: [
          { cuenta: "Efectivo", saldo: 100_000 },
          { cuenta: "BANCOLOMBIA", saldo: 2_050_000 },
          { cuenta: "nequi", saldo: 30_000 },
        ],
      },
      "2026-11-02",
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].note).toBe("Cierre de mes 2026-10: cuadre con el banco");
    expect(saved[0].movementDate.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(saved[0].accountIds).toEqual(["a1", "a2", "a3"]);
    expect(saved[0].adjustments.map(({ accountId, type, amount }) => ({ accountId, type, amount }))).toEqual([
      { accountId: "a2", type: "IN", amount: 50_000 },
      { accountId: "a3", type: "OUT", amount: 20_000 },
    ]);
    expect(describeMonthClose(plan, true)).toBe(
      "En Bancolombia faltaban $50.000, en Nequi sobraban $20.000, ya quedó ajustado.",
    );
  });

  it("todo cuadra: una linea", async () => {
    const { deps } = fakeDeps();
    const plan = await confirmMonthClose(
      deps,
      { saldos: ACCOUNTS.map((a) => ({ cuenta: a.name, saldo: a.balance })) },
      "2026-11-02",
    );
    expect(describeMonthClose(plan, true)).toBe("Cuadró.");
  });

  it("segundo intento del mismo mes no duplica", async () => {
    const { deps, saved } = fakeDeps();
    const input = { saldos: [{ cuenta: "Nequi", saldo: 0 }] };
    await confirmMonthClose(deps, input, "2026-11-02");
    const second = await confirmMonthClose(deps, input, "2026-11-02");
    expect(saved).toHaveLength(1);
    expect(second.lines[0].estado).toBe("ya_cerrada");
    expect(describeMonthClose(second, true)).toBe("Nequi: ya cerrado este mes, no se tocó; falta el saldo de Efectivo, Bancolombia.");
  });

  it("si otro cierre gano el candado, esa cuenta queda como ya cerrada", async () => {
    const { deps } = fakeDeps();
    deps.saveClose = async () => ({ skippedAccountIds: ["a3"] });
    const plan = await confirmMonthClose(deps, { saldos: [{ cuenta: "Nequi", saldo: 0 }] }, "2026-11-02");
    expect(plan.lines[0].estado).toBe("ya_cerrada");
  });

  it("rechaza cuenta inexistente o inactiva, repetida y lista vacia", () => {
    expect(() => planMonthClose({ ...base, dictated: [{ cuenta: "Davivienda", saldo: 1 }] })).toThrow(/No hay una cuenta activa/);
    expect(() =>
      planMonthClose({ ...base, dictated: [{ cuenta: "nequi", saldo: 1 }, { cuenta: "Nequi", saldo: 1 }] }),
    ).toThrow(/dos veces/);
    expect(() => planMonthClose({ ...base, dictated: [] })).toThrow(MonthCloseInputError);
  });

  it("nombre parcial solo si es unico", () => {
    const plan = planMonthClose({ ...base, dictated: [{ cuenta: "banco", saldo: 2_000_000 }] });
    expect(plan.lines[0].name).toBe("Bancolombia");
  });

  it("tope: diferencia grande pide confirmar de nuevo", async () => {
    const { deps, saved } = fakeDeps();
    const input = { saldos: [{ cuenta: "Bancolombia", saldo: 20_000_000 }] };
    const prepared = await prepareMonthClose(deps, input, "2026-11-02");
    expect(prepared.grandes).toEqual(["Bancolombia"]);
    expect(describeMonthClose(prepared, false)).toBe(
      "En Bancolombia faltan $18.000.000, al confirmar se ajusta; falta el saldo de Efectivo, Nequi.",
    );
    await expect(confirmMonthClose(deps, input, "2026-11-02")).rejects.toThrow(/confirmar_diferencia_grande/);
    expect(saved).toHaveLength(0);
    await confirmMonthClose(deps, { ...input, confirmarDiferenciaGrande: true }, "2026-11-02");
    expect(saved[0].adjustments[0]).toMatchObject({ type: "IN", amount: 18_000_000 });
  });

  it("mensaje del WhatsApp", () => {
    expect(closeReminderMessage("2026-11", ["Efectivo", "Nequi"])).toContain("Efectivo, Nequi");
  });
});
