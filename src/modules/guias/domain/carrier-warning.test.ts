import { describe, expect, it } from "vitest";

import {
  ELEICID_DEFAULT_WARNING,
  isEleicidCarrierName,
  parseWarningLines,
  resolveDispatchWarning,
} from "./carrier-warning";

describe("isEleicidCarrierName", () => {
  it("detecta las variantes del nombre sin importar tildes ni mayusculas", () => {
    expect(isEleicidCarrierName("P-06 Eliecer")).toBe(true);
    expect(isEleicidCarrierName("P-06 ELIÉCER")).toBe(true);
    expect(isEleicidCarrierName("Eleicid")).toBe(true);
    expect(isEleicidCarrierName("elicid transportes")).toBe(true);
  });
  it("no confunde otros transportadores", () => {
    expect(isEleicidCarrierName("Servientrega")).toBe(false);
    expect(isEleicidCarrierName("P-07 Elena")).toBe(false);
    expect(isEleicidCarrierName("")).toBe(false);
    expect(isEleicidCarrierName(null)).toBe(false);
  });
});

describe("resolveDispatchWarning", () => {
  it("Eleicid sin texto propio usa los 4 puntos por defecto", () => {
    const lines = resolveDispatchWarning({ name: "P-06 Eliecer", dispatchWarning: null });
    expect(lines).toEqual([...ELEICID_DEFAULT_WARNING]);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/foto hoy/);
  });
  it("el texto guardado en el proveedor manda", () => {
    expect(resolveDispatchWarning({ name: "P-06 Eliecer", dispatchWarning: "- Uno\n\n* Dos\n3. Tres" })).toEqual([
      "Uno",
      "Dos",
      "Tres",
    ]);
    expect(resolveDispatchWarning({ name: "Envia", dispatchWarning: "Solo martes" })).toEqual(["Solo martes"]);
  });
  it("sin texto ni nombre conocido no avisa", () => {
    expect(resolveDispatchWarning({ name: "Envia", dispatchWarning: "   " })).toEqual([]);
    expect(resolveDispatchWarning(undefined)).toEqual([]);
  });
  it("detecta por el nombre visible", () => {
    expect(resolveDispatchWarning({ name: "P-06", displayName: "Eliécer" })).toHaveLength(4);
  });
});

describe("parseWarningLines", () => {
  it("separa por lineas y quita viñetas", () => {
    expect(parseWarningLines("• a\r\n1) b")).toEqual(["a", "b"]);
    expect(parseWarningLines(null)).toEqual([]);
  });
});
