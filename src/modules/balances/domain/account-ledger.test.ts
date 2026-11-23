import { describe, expect, it } from "vitest";
import { buildAccountLedger, findAccountByName, type AccountLedgerInput } from "./account-ledger";

const row = (fecha: string, sentido: "entrada" | "salida", valor: number, extra: Partial<AccountLedgerInput> = {}): AccountLedgerInput => ({
  fecha: new Date(fecha),
  origen: sentido === "entrada" ? "abono" : "gasto",
  sentido,
  valor,
  referencia: null,
  nota: null,
  registradoPor: "Ingrid",
  ...extra,
});

describe("buildAccountLedger", () => {
  it("saldo inicial + entradas - salidas = saldo final", () => {
    const ledger = buildAccountLedger(100_000, [
      row("2026-11-01T15:00:00Z", "entrada", 500_000),
      row("2026-11-02T15:00:00Z", "salida", 270_000),
    ]);
    expect(ledger.saldo_inicial).toBe(100_000);
    expect(ledger.total_entradas).toBe(500_000);
    expect(ledger.total_salidas).toBe(270_000);
    expect(ledger.saldo_final).toBe(330_000);
    expect(ledger.lineas.map((l) => l.saldo)).toEqual([600_000, 330_000]);
    expect(ledger.cortado).toBe(false);
  });

  it("con desde arranca del saldo acumulado hasta esa fecha", () => {
    const ledger = buildAccountLedger(
      0,
      [
        row("2026-10-31T23:00:00Z", "entrada", 50_000), // 31-oct 6 p. m. en Colombia
        row("2026-11-01T04:00:00Z", "entrada", 20_000), // aún 31-oct en Colombia
        row("2026-11-05T15:00:00Z", "salida", 10_000),
        row("2026-11-20T15:00:00Z", "salida", 5_000),
      ],
      { desde: "2026-11-01", hasta: "2026-11-10" },
    );
    expect(ledger.saldo_inicial).toBe(70_000);
    expect(ledger.lineas).toHaveLength(1);
    expect(ledger.total_salidas).toBe(10_000);
    expect(ledger.saldo_final).toBe(60_000);
  });

  it("ordena los movimientos por fecha", () => {
    const ledger = buildAccountLedger(0, [
      row("2026-11-03T15:00:00Z", "salida", 1),
      row("2026-11-01T15:00:00Z", "entrada", 3),
      row("2026-11-02T15:00:00Z", "entrada", 2),
    ]);
    expect(ledger.lineas.map((l) => l.fecha)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(ledger.saldo_final).toBe(4);
  });

  it("un traslado se cuenta igual que en el saldo (cada pata IN/OUT por su lado)", () => {
    const ledger = buildAccountLedger(0, [
      row("2026-11-01T15:00:00Z", "entrada", 100_000, { origen: "movimiento", traslado: true }),
      row("2026-11-02T15:00:00Z", "salida", 40_000, { origen: "movimiento", traslado: true }),
    ]);
    expect(ledger.saldo_final).toBe(60_000);
    expect(ledger.lineas[0].tipo).toBe("movimiento manual (traslado)");
  });

  it("un gasto de Nómina sale como «nómina»", () => {
    const ledger = buildAccountLedger(0, [
      row("2026-11-01T15:00:00Z", "salida", 10, { categoria: "Nómina" }),
      row("2026-11-01T15:00:00Z", "salida", 10, { categoria: "Marketing" }),
    ]);
    expect(ledger.lineas.map((l) => l.tipo)).toEqual(["nómina", "gasto"]);
  });

  it("muestra máximo 500 líneas (las más nuevas) y los totales cuentan todo", () => {
    const rows = Array.from({ length: 502 }, (_, i) => row(new Date(Date.UTC(2026, 0, 1, 15) + i * 86_400_000).toISOString(), "entrada", 1));
    const ledger = buildAccountLedger(0, rows);
    expect(ledger.cortado).toBe(true);
    expect(ledger.lineas).toHaveLength(500);
    expect(ledger.lineas[0].saldo).toBe(3);
    expect(ledger.total_entradas).toBe(502);
    expect(ledger.saldo_final).toBe(502);
  });
});

describe("findAccountByName", () => {
  const accounts = [{ name: "2-Nequi" }, { name: "1-Bancolombia" }, { name: "Bancolombia Ahorros" }];
  it("compara sin tildes ni mayúsculas y no adivina si hay varias", () => {
    expect(findAccountByName(accounts, "NEQUÍ")?.name).toBe("2-Nequi");
    expect(findAccountByName(accounts, "1-bancolombia")?.name).toBe("1-Bancolombia");
    expect(findAccountByName(accounts, "bancolombia")).toBeNull();
    expect(findAccountByName(accounts, "davivienda")).toBeNull();
  });
});
