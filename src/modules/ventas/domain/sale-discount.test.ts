import { describe, expect, it } from "vitest";
import { validarDescuentoVenta } from "./sale-discount";
import { saleStatusForPaid } from "./sale-paid-status";

const base = { monto: 39000, motivo: "Daño en el transporte (camilla rajada)", total: 1149000, pagado: 160000, ventaCancelada: false, ordenCancelada: false };

describe("validarDescuentoVenta", () => {
  it("SAL-96: 1.149.000 − 39.000 con 160.000 pagado → total 1.110.000 y saldo 950.000", () => {
    expect(validarDescuentoVenta(base)).toEqual({
      ok: true,
      monto: 39000,
      motivo: "Daño en el transporte (camilla rajada)",
      nuevoTotal: 1110000,
      nuevoSaldo: 950000,
    });
  });

  it("monto 0 o negativo → error", () => {
    expect(validarDescuentoVenta({ ...base, monto: 0 }).ok).toBe(false);
    expect(validarDescuentoVenta({ ...base, monto: -5 }).ok).toBe(false);
    expect(validarDescuentoVenta({ ...base, monto: Number.NaN }).ok).toBe(false);
  });

  it("monto mayor que el saldo → error", () => {
    expect(validarDescuentoVenta({ ...base, monto: 989001 }).ok).toBe(false);
    expect(validarDescuentoVenta({ ...base, pagado: 1149000, monto: 1 }).ok).toBe(false);
  });

  it("motivo corto → error", () => {
    expect(validarDescuentoVenta({ ...base, motivo: " ab " }).ok).toBe(false);
  });

  it("venta u orden cancelada → error", () => {
    expect(validarDescuentoVenta({ ...base, ventaCancelada: true }).ok).toBe(false);
    expect(validarDescuentoVenta({ ...base, ordenCancelada: true }).ok).toBe(false);
  });

  it("descuento igual al saldo → la venta queda pagada", () => {
    const r = validarDescuentoVenta({ ...base, monto: 989000 });
    expect(r.ok && r.nuevoSaldo).toBe(0);
    expect(r.ok && saleStatusForPaid(base.pagado, r.nuevoTotal, "ACTIVE")).toBe("INVOICED");
  });
});
