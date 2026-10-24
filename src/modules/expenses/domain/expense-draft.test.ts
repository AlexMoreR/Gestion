import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_ATTEMPTS,
  draftAvailability,
  isPayrollCategoryName,
  resolveAccount,
  resolveCategoryName,
  type AccountOption,
} from "./expense-draft";

const now = new Date("2026-10-24T15:00:00Z");
const future = new Date(now.getTime() + 10 * 60_000);
const past = new Date(now.getTime() - 1000);

describe("draftAvailability", () => {
  it("abierto: pendiente, vigente y con intentos", () => {
    expect(draftAvailability({ status: "PENDIENTE", expiresAt: future, attempts: 2 }, now)).toEqual({ open: true });
  });

  it("guardado: ya se uso", () => {
    const result = draftAvailability({ status: "GUARDADO", expiresAt: future, attempts: 0 }, now);
    expect(result).toMatchObject({ open: false, status: "GUARDADO" });
  });

  it("rechazado, o con intentos agotados", () => {
    expect(draftAvailability({ status: "RECHAZADO", expiresAt: future, attempts: 1 }, now)).toMatchObject({
      open: false,
      status: "RECHAZADO",
    });
    expect(draftAvailability({ status: "PENDIENTE", expiresAt: future, attempts: DRAFT_MAX_ATTEMPTS }, now)).toMatchObject({
      open: false,
      status: "RECHAZADO",
    });
  });

  it("vencido por estado o por hora (incluido el instante exacto)", () => {
    expect(draftAvailability({ status: "VENCIDO", expiresAt: future, attempts: 0 }, now)).toMatchObject({ status: "VENCIDO" });
    expect(draftAvailability({ status: "PENDIENTE", expiresAt: past, attempts: 0 }, now)).toMatchObject({ status: "VENCIDO" });
    expect(draftAvailability({ status: "PENDIENTE", expiresAt: now, attempts: 0 }, now)).toMatchObject({ status: "VENCIDO" });
  });
});

describe("categorias", () => {
  it("traduce las palabras del dueno", () => {
    expect(resolveCategoryName("publicidad")).toBe("Marketing");
    expect(resolveCategoryName("otros")).toBe("Varios");
    expect(resolveCategoryName("nómina")).toBe("Nomina");
    expect(resolveCategoryName("  Arriendo ")).toBe("Arriendo");
  });

  it("categoria desconocida -> null", () => {
    expect(resolveCategoryName("viajes")).toBeNull();
    expect(resolveCategoryName("")).toBeNull();
  });

  it("detecta la categoria de nomina con o sin tilde", () => {
    expect(isPayrollCategoryName("Nómina")).toBe(true);
    expect(isPayrollCategoryName("Nomina")).toBe(true);
    expect(isPayrollCategoryName("Marketing")).toBe(false);
  });
});

describe("resolveAccount", () => {
  const caja: AccountOption = { id: "a1", name: "Caja", type: "CASH" };
  const bancolombia: AccountOption = { id: "a2", name: "Bancolombia", type: "BANK" };
  const nequi: AccountOption = { id: "a3", name: "Nequi Alex", type: "WALLET" };
  const davivienda: AccountOption = { id: "a4", name: "Davivienda", type: "BANK" };

  it("resuelve por tipo", () => {
    const accounts = [caja, bancolombia, nequi];
    expect(resolveAccount("efectivo", accounts)).toEqual({ ok: true, account: caja });
    expect(resolveAccount("banco", accounts)).toEqual({ ok: true, account: bancolombia });
    expect(resolveAccount("billetera", accounts)).toEqual({ ok: true, account: nequi });
  });

  it("dos cuentas del mismo tipo: error que lista los nombres", () => {
    const result = resolveAccount("banco", [caja, bancolombia, davivienda]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Bancolombia");
      expect(result.error).toContain("Davivienda");
    }
  });

  it("por nombre exacto aunque haya dos del mismo tipo", () => {
    expect(resolveAccount("davivienda", [bancolombia, davivienda])).toEqual({ ok: true, account: davivienda });
  });

  it("ninguna coincide o palabra vacia", () => {
    const none = resolveAccount("billetera", [caja, bancolombia]);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error).toContain("Caja, Bancolombia");
    expect(resolveAccount("", [caja]).ok).toBe(false);
  });
});
