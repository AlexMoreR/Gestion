import { describe, expect, it } from "vitest";
import { bloqueoPasarAInventario, maxDevolucion, parseDevolucion } from "./cancelled-sale";

const hoy = new Date("2026-11-28T15:00:00Z");

describe("bloqueoPasarAInventario", () => {
  const base = { ventaEstado: "CANCELLED", ordenEstado: "CANCELLED", modo: "MANUFACTURE", yaPaso: false };
  it("deja pasar un producto de Fabricación de una venta anulada", () => {
    expect(bloqueoPasarAInventario(base)).toBeNull();
  });
  it("bloquea venta viva, producto de Stock o uno que ya pasó", () => {
    expect(bloqueoPasarAInventario({ ...base, ventaEstado: "ACTIVE" })).toMatch(/venta anulada/);
    expect(bloqueoPasarAInventario({ ...base, ordenEstado: "RELEASED" })).toMatch(/venta anulada/);
    expect(bloqueoPasarAInventario({ ...base, modo: "STOCK" })).toMatch(/Fabricación/);
    expect(bloqueoPasarAInventario({ ...base, yaPaso: true })).toMatch(/ya se pasó/);
  });
});

describe("maxDevolucion", () => {
  it("es lo pagado menos lo devuelto, nunca negativo", () => {
    expect(maxDevolucion(1_275_000, 637_500)).toBe(637_500);
    expect(maxDevolucion(1_275_000, 1_275_000)).toBe(0);
    expect(maxDevolucion(100, 200)).toBe(0);
  });
});

describe("parseDevolucion", () => {
  const ok = { accountId: "c1", monto: "637.500", fecha: "2026-11-28", motivo: "La clienta no recibió" };
  it("acepta una devolución de hoy dentro de lo pagado", () => {
    expect(parseDevolucion(ok, 1_275_000, hoy)).toEqual({
      ok: true,
      value: { accountId: "c1", monto: 637_500, fecha: "2026-11-28", motivo: "La clienta no recibió", motivoRetroactivo: null },
    });
  });
  it("rechaza pasar de lo pagado, monto 0, sin cuenta, sin motivo y fecha futura", () => {
    expect(parseDevolucion({ ...ok, monto: "1" }, 0, hoy).ok).toBe(false);
    expect(parseDevolucion({ ...ok, monto: "0" }, 100, hoy).ok).toBe(false);
    expect(parseDevolucion({ ...ok, accountId: "" }, 1_275_000, hoy).ok).toBe(false);
    expect(parseDevolucion({ ...ok, motivo: "no" }, 1_275_000, hoy).ok).toBe(false);
    expect(parseDevolucion({ ...ok, fecha: "2026-11-29" }, 1_275_000, hoy).ok).toBe(false);
  });
  it("con fecha anterior a hoy pide el motivo del registro atrasado", () => {
    expect(parseDevolucion({ ...ok, fecha: "2026-11-20" }, 1_275_000, hoy).ok).toBe(false);
    const r = parseDevolucion({ ...ok, fecha: "2026-11-20", motivoRetroactivo: "Se devolvió el 20 y se carga hoy" }, 1_275_000, hoy);
    expect(r.ok && r.value.motivoRetroactivo).toBe("Se devolvió el 20 y se carga hoy");
  });
});
