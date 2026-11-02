import { describe, expect, it, vi } from "vitest";
import {
  CIERRE_TOPE_DIFERENCIA,
  MonthCloseInputError,
  buildCloseReminder,
  closeMonthNote,
  confirmMonthClose,
  describeCloseResult,
  isLastDayOfMonth,
  lastDayOfMonth,
  planMonthClose,
  prepareMonthClose,
  resolveCloseMonth,
  type CloseAccount,
  type MonthCloseDeps,
} from "./close-month";

const banco: CloseAccount = { id: "b", name: "1-Bancolombia", type: "BANK", saldoGestion: 1_000_000, cerrada: false };
const caja: CloseAccount = { id: "c", name: "Efectivo", type: "CASH", saldoGestion: 200_000, cerrada: false };
// 31-oct-2026 a las 9 p. m. en Colombia (02:00Z del 1-nov).
const LAST_DAY_NIGHT = new Date("2026-11-01T02:00:00.000Z");
const NOV_2 = new Date("2026-11-02T15:00:00.000Z");

function fakeDeps(accounts: CloseAccount[], now = LAST_DAY_NIGHT) {
  const created: { accountId: string; type: string; amount: number; note: string; movementDate: Date }[] = [];
  const deps: MonthCloseDeps = {
    now: () => now,
    loadAccounts: async () =>
      accounts.map((account) => ({ ...account, cerrada: account.cerrada || created.some((row) => row.accountId === account.id) })),
    applyAdjustments: vi.fn(async ({ note, movementDate, adjustments }: Parameters<MonthCloseDeps["applyAdjustments"]>[0]) => {
      const pending = adjustments.filter((item) => !created.some((row) => row.accountId === item.accountId));
      created.push(...pending.map((item) => ({ ...item, note, movementDate })));
      return pending.map((item) => item.accountId);
    }),
    resolveActor: async () => ({ id: "admin", name: "Alexander" }),
    logActivity: vi.fn(async () => {}),
  };
  return { deps, created };
}

describe("mes del cierre", () => {
  it("el ultimo dia es el mes en curso; otro dia, el mes anterior", () => {
    expect(isLastDayOfMonth(LAST_DAY_NIGHT)).toBe(true);
    expect(resolveCloseMonth(undefined, LAST_DAY_NIGHT)).toBe("2026-10");
    expect(isLastDayOfMonth(NOV_2)).toBe(false);
    expect(resolveCloseMonth(undefined, NOV_2)).toBe("2026-10");
    expect(resolveCloseMonth(undefined, new Date("2027-01-02T15:00:00.000Z"))).toBe("2026-12");
  });

  it("no cierra un mes que aun no termina", () => {
    expect(() => resolveCloseMonth("2026-11", NOV_2)).toThrow(MonthCloseInputError);
    expect(() => resolveCloseMonth("2026-12", NOV_2)).toThrow(MonthCloseInputError);
    expect(() => resolveCloseMonth("2026-13", NOV_2)).toThrow(MonthCloseInputError);
    expect(resolveCloseMonth("2026-09", NOV_2)).toBe("2026-09");
  });

  it("ultimo dia del mes, incluido febrero", () => {
    expect(lastDayOfMonth("2026-10")).toBe("2026-10-31");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
  });
});

describe("planMonthClose", () => {
  it("cuadra sin movimiento", () => {
    const plan = planMonthClose("2026-10", [banco, caja], [
      { cuenta: "1-Bancolombia", saldo: 1_000_000 },
      { cuenta: "efectivo", saldo: 200_000 },
    ]);
    expect(plan.lines.map((line) => line.accion)).toEqual(["cuadra", "cuadra"]);
    expect(describeCloseResult(plan, true)).toBe("Cuadró");
  });

  it("falta plata en Gestion = entrada; sobra = salida", () => {
    const plan = planMonthClose("2026-10", [banco, caja], [
      { cuenta: "banco", saldo: 1_050_000 },
      { cuenta: "Efectivo", saldo: 180_000 },
    ]);
    expect(plan.lines.map((line) => [line.tipo, line.diferencia])).toEqual([
      ["IN", 50_000],
      ["OUT", -20_000],
    ]);
    expect(describeCloseResult(plan, true)).toBe(
      "En 1-Bancolombia faltaban 50.000 pesos, ya quedó ajustado; En Efectivo sobraban 20.000 pesos, ya quedó ajustado",
    );
  });

  it("rechaza cuenta inexistente o inactiva (no esta en la lista) y cuenta repetida", () => {
    expect(() => planMonthClose("2026-10", [banco], [{ cuenta: "Nequi vieja", saldo: 1 }])).toThrow(MonthCloseInputError);
    expect(() =>
      planMonthClose("2026-10", [banco], [
        { cuenta: "banco", saldo: 1 },
        { cuenta: "1-Bancolombia", saldo: 2 },
      ]),
    ).toThrow(/dos veces/);
  });

  it("avisa las cuentas que faltan y marca las diferencias grandes", () => {
    const plan = planMonthClose("2026-10", [banco, caja], [{ cuenta: "banco", saldo: 1_000_000 + CIERRE_TOPE_DIFERENCIA + 1 }]);
    expect(plan.faltan).toEqual(["Efectivo"]);
    expect(plan.grandes).toHaveLength(1);
    expect(describeCloseResult({ ...plan, lines: [] }, true)).toBe("Cuadró. Falta el saldo de: Efectivo.");
  });
});

describe("confirmMonthClose", () => {
  it("crea un ajuste por cuenta con la nota y la fecha del ultimo dia", async () => {
    const { deps, created } = fakeDeps([banco, caja]);
    const result = await confirmMonthClose(deps, {
      saldos: [
        { cuenta: "banco", saldo: 1_050_000 },
        { cuenta: "efectivo", saldo: 200_000 },
      ],
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ accountId: "b", type: "IN", amount: 50_000, note: closeMonthNote("2026-10") });
    expect(created[0].movementDate.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(result.resumen).toBe("En 1-Bancolombia faltaban 50.000 pesos, ya quedó ajustado");
    expect(deps.logActivity).toHaveBeenCalledOnce();
  });

  it("un segundo intento del mismo mes no duplica", async () => {
    const { deps, created } = fakeDeps([banco]);
    const input = { saldos: [{ cuenta: "banco", saldo: 900_000 }] };
    await confirmMonthClose(deps, input);
    const again = await confirmMonthClose(deps, input);
    expect(created).toHaveLength(1);
    expect(again.resumen).toBe("1-Bancolombia ya estaba cerrada este mes");
  });

  it("si otro cierre se adelanto (doble clic), no cuenta el ajuste como propio", async () => {
    const { deps } = fakeDeps([banco]);
    deps.applyAdjustments = async () => [];
    const result = await confirmMonthClose(deps, { saldos: [{ cuenta: "banco", saldo: 900_000 }] });
    expect(result.resumen).toBe("1-Bancolombia ya estaba cerrada este mes");
  });

  it("una diferencia mayor al tope exige confirmarla aparte", async () => {
    const { deps, created } = fakeDeps([banco]);
    const saldos = [{ cuenta: "banco", saldo: 1_000_000 + CIERRE_TOPE_DIFERENCIA + 1 }];
    await expect(confirmMonthClose(deps, { saldos })).rejects.toThrow(/acepto_diferencia_grande/);
    expect(created).toHaveLength(0);
    await confirmMonthClose(deps, { saldos, aceptoDiferenciaGrande: true });
    expect(created).toHaveLength(1);
  });

  it("la simulacion no escribe", async () => {
    const { deps, created } = fakeDeps([banco]);
    const plan = await prepareMonthClose(deps, { saldos: [{ cuenta: "banco", saldo: 0 }] });
    expect(describeCloseResult(plan, false)).toBe("En 1-Bancolombia sobran 1.000.000 pesos, se ajustará");
    expect(created).toHaveLength(0);
  });
});

it("el aviso del ultimo dia nombra el mes y las cuentas, sin saldos", () => {
  expect(buildCloseReminder("2026-10", ["1-Bancolombia", "Efectivo"])).toContain("octubre de 2026");
  expect(buildCloseReminder("2026-10", ["1-Bancolombia", "Efectivo"])).toContain("1-Bancolombia, Efectivo");
});
