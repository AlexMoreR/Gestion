import { describe, expect, it } from "vitest";
import { MOTIVO_CAMBIO_CUENTA_ERROR, errorCambioCuentaAbono } from "./sale-payment-account";

const abono = { accountId: "gladys", isWithholding: false };
const sofia = { id: "sofia", isActive: true, type: "BANK" };

describe("errorCambioCuentaAbono", () => {
  it("acepta el caso normal", () => {
    expect(errorCambioCuentaAbono({ abono, cuentaNueva: sofia, motivo: "consignó en Sofía" })).toBeNull();
  });
  it("acepta un abono que no tenía cuenta", () => {
    expect(errorCambioCuentaAbono({ abono: { accountId: null, isWithholding: false }, cuentaNueva: sofia, motivo: "abc" })).toBeNull();
  });
  it("rechaza abono inexistente", () => {
    expect(errorCambioCuentaAbono({ abono: null, cuentaNueva: sofia, motivo: "abc" })).toBe("No se encontró el abono");
  });
  it("rechaza la retención en la fuente", () => {
    expect(errorCambioCuentaAbono({ abono: { accountId: null, isWithholding: true }, cuentaNueva: sofia, motivo: "abc" })).toMatch(/retención/);
  });
  it("rechaza motivo corto", () => {
    expect(errorCambioCuentaAbono({ abono, cuentaNueva: sofia, motivo: " ab " })).toBe(MOTIVO_CAMBIO_CUENTA_ERROR);
  });
  it("rechaza cuenta inactiva o inexistente", () => {
    expect(errorCambioCuentaAbono({ abono, cuentaNueva: { ...sofia, isActive: false }, motivo: "abc" })).toBe("Elige una cuenta activa");
    expect(errorCambioCuentaAbono({ abono, cuentaNueva: null, motivo: "abc" })).toBe("Elige una cuenta activa");
  });
  it("rechaza la cuenta OWNER", () => {
    expect(errorCambioCuentaAbono({ abono, cuentaNueva: { ...sofia, type: "OWNER" }, motivo: "abc" })).toMatch(/Aportes del dueño/);
  });
  it("rechaza la misma cuenta", () => {
    expect(errorCambioCuentaAbono({ abono, cuentaNueva: { ...sofia, id: "gladys" }, motivo: "abc" })).toBe("El abono ya está en esa cuenta");
  });
});
