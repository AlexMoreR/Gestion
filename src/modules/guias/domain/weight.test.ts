import { describe, expect, it } from "vitest";

import { formatWeightKg, parseWeightKg } from "./weight";

describe("parseWeightKg", () => {
  it("vacio o ausente = sin peso", () => {
    expect(parseWeightKg(null)).toEqual({ ok: true, value: null });
    expect(parseWeightKg(undefined)).toEqual({ ok: true, value: null });
    expect(parseWeightKg("")).toEqual({ ok: true, value: null });
    expect(parseWeightKg("   ")).toEqual({ ok: true, value: null });
  });

  it("admite coma o punto decimal", () => {
    expect(parseWeightKg("12,5")).toEqual({ ok: true, value: 12.5 });
    expect(parseWeightKg("12.5")).toEqual({ ok: true, value: 12.5 });
    expect(parseWeightKg(" 40 ")).toEqual({ ok: true, value: 40 });
    expect(parseWeightKg("7,25 kg")).toEqual({ ok: true, value: 7.25 });
  });

  it("redondea a 2 decimales", () => {
    expect(parseWeightKg("1,239")).toEqual({ ok: true, value: 1.24 });
  });

  it("rechaza cero, negativos, texto y valores enormes", () => {
    expect(parseWeightKg("0").ok).toBe(false);
    expect(parseWeightKg("0,001").ok).toBe(false);
    expect(parseWeightKg("-3").ok).toBe(false);
    expect(parseWeightKg("abc").ok).toBe(false);
    expect(parseWeightKg("1.000,5").ok).toBe(false);
    expect(parseWeightKg("10000").ok).toBe(false);
    expect(parseWeightKg("9999,99")).toEqual({ ok: true, value: 9999.99 });
    expect(parseWeightKg(12 as unknown).ok).toBe(false);
  });
});

describe("formatWeightKg", () => {
  it("formato es-CO", () => {
    expect(formatWeightKg(12.5)).toBe("12,5 kg");
    expect(formatWeightKg(40)).toBe("40 kg");
    expect(formatWeightKg(null)).toBeNull();
    expect(formatWeightKg(0)).toBeNull();
  });
});
