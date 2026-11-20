import { describe, expect, it } from "vitest";
import { abonosQueCambian, avisoFechaAbonos, fechaDeOrdenCambio } from "./order-date-edit";

describe("fechaDeOrdenCambio", () => {
  it("mismo día en hora Colombia → no cambió", () => {
    // 15-oct 12:00 Colombia = 17:00Z; y una hora de la noche que en UTC ya es el día siguiente.
    expect(fechaDeOrdenCambio("2026-10-15", new Date("2026-10-15T17:00:00Z"))).toBe(false);
    expect(fechaDeOrdenCambio("2026-10-15", new Date("2026-10-16T03:00:00Z"))).toBe(false);
  });

  it("otro día → sí cambió; vacío → no", () => {
    expect(fechaDeOrdenCambio("2026-11-02", new Date("2026-10-15T17:00:00Z"))).toBe(true);
    expect(fechaDeOrdenCambio("", new Date("2026-10-15T17:00:00Z"))).toBe(false);
  });
});

describe("avisoFechaAbonos", () => {
  it("texto exacto con 2 abonos de octubre a noviembre", () => {
    expect(avisoFechaAbonos(["2026-10-05", "2026-10-20"], "2026-11-02")).toBe(
      "Esto también cambia la fecha de 2 abonos (de octubre a noviembre)",
    );
  });

  it("sin abonos, o todos ya en ese día → sin aviso", () => {
    expect(avisoFechaAbonos([], "2026-11-02")).toBeNull();
    expect(avisoFechaAbonos(["2026-11-02"], "2026-11-02")).toBeNull();
  });

  it("abonos en dos meses → «de octubre y noviembre a …»", () => {
    expect(avisoFechaAbonos(["2026-11-03", "2026-10-05"], "2026-12-01")).toBe(
      "Esto también cambia la fecha de 2 abonos (de octubre y noviembre a diciembre)",
    );
  });

  it("un abono en singular; y años distintos llevan el año", () => {
    expect(avisoFechaAbonos(["2026-12-20"], "2027-01-05")).toBe(
      "Esto también cambia la fecha de 1 abono (de diciembre de 2026 a enero de 2027)",
    );
  });

  it("solo cuenta los abonos que cambian de día", () => {
    expect(abonosQueCambian(["2026-11-02", "2026-10-05"], "2026-11-02")).toEqual(["2026-10-05"]);
  });
});
