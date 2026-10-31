import { describe, expect, it } from "vitest";
import { enPeriodo, fechaContable } from "./corte-mes";
import { resolveMonthPeriod } from "./month-period";

const noviembre = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") };
const octubre = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-11-01T00:00:00Z") };

describe("corte de mes en Colombia", () => {
  it("un pago a las 11 p. m. del 30-nov en Colombia cuenta en noviembre", () => {
    expect(enPeriodo(new Date("2026-12-01T04:00:00Z"), noviembre)).toBe(true);
  });

  it("un pago a las 12:30 a. m. del 1-dic en Colombia cuenta en diciembre", () => {
    expect(enPeriodo(new Date("2026-12-01T05:30:00Z"), noviembre)).toBe(false);
  });

  it("un pago a las 8 p. m. del 31-oct en Colombia ya cuenta en octubre", () => {
    expect(enPeriodo(new Date("2026-11-01T01:00:00Z"), octubre)).toBe(true);
    expect(enPeriodo(new Date("2026-11-01T01:00:00Z"), noviembre)).toBe(false);
  });

  it("una fecha de calendario del dia 1 (medianoche o mediodia UTC) no se corre", () => {
    expect(enPeriodo(new Date("2026-12-01T00:00:00Z"), noviembre)).toBe(false);
    expect(enPeriodo(new Date("2026-11-01T00:00:00Z"), noviembre)).toBe(true);
    expect(enPeriodo(new Date("2026-11-01T12:00:00Z"), noviembre)).toBe(true);
  });

  it("los meses anteriores a noviembre de 2026 quedan igual que antes", () => {
    const septiembre = new Date("2026-10-01T01:00:00Z"); // 8 p. m. del 30-sep en Colombia
    expect(fechaContable(septiembre)).toEqual(septiembre);
    expect(enPeriodo(septiembre, octubre)).toBe(true);
  });
});

describe("resolveMonthPeriod", () => {
  it("valida el mes pedido y da limites de calendario", () => {
    const resolved = resolveMonthPeriod("2026-11");
    expect(resolved.value).toBe("2026-11");
    expect(resolved.period).toEqual(noviembre);
  });
});
