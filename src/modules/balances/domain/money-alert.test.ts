import { describe, expect, it } from "vitest";

import { buildMoneyAlert, type UnaccountedRecord } from "./money-alert";

describe("buildMoneyAlert", () => {
  it("sin problemas no avisa", () => {
    expect(buildMoneyAlert([{ name: "Caja", balance: 100 }, { name: "Banco", balance: 0 }], [])).toEqual({
      avisar: false,
      mensaje: "",
    });
  });

  it("nombra la cuenta en negativo con su saldo", () => {
    const alert = buildMoneyAlert([{ name: "Caja", balance: -5_136_330 }, { name: "Banco", balance: 50 }], []);
    expect(alert.avisar).toBe(true);
    expect(alert.mensaje).toBe("Caja en -$5.136.330.");
  });

  it("nombra la venta o la proveedora y el monto de lo guardado sin cuenta", () => {
    const alert = buildMoneyAlert([], [
      { kind: "flete", ref: "SAL-0123", amount: 80_000 },
      { kind: "pago_proveedor", ref: "Muebles Ana", amount: 300_000 },
    ]);
    expect(alert.mensaje).toBe("2 sin cuenta en las últimas 24 h: flete SAL-0123 ($80.000) y pago a Muebles Ana ($300.000).");
  });

  it("con más de 3 casos lista 3 y dice cuántos faltan", () => {
    const fletes: UnaccountedRecord[] = Array.from({ length: 52 }, (_, i) => ({
      kind: "flete",
      ref: `SAL-${String(100 + i).padStart(4, "0")}`,
      amount: 10_000,
    }));
    const alert = buildMoneyAlert([{ name: "Caja", balance: -5_136_330 }], fletes);
    const lines = alert.mensaje.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      "52 sin cuenta en las últimas 24 h: flete SAL-0100 ($10.000), flete SAL-0101 ($10.000), flete SAL-0102 ($10.000) y 49 más.",
    );
  });

  it("la retención en la fuente no aparece", () => {
    const alert = buildMoneyAlert([], [{ kind: "abono", ref: "SAL-0200", amount: 25_000, isWithholding: true }]);
    expect(alert).toEqual({ avisar: false, mensaje: "" });
    const mixed = buildMoneyAlert([], [
      { kind: "abono", ref: "SAL-0200", amount: 25_000, isWithholding: true },
      { kind: "abono", ref: "SAL-0201", amount: 40_000 },
    ]);
    expect(mixed.mensaje).toBe("1 sin cuenta en las últimas 24 h: abono SAL-0201 ($40.000).");
  });
});
