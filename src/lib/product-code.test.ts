import { describe, expect, it } from "vitest";
import { normalizeProductCode, productCodeSchema, validateProductCode } from "./product-code";

describe("validateProductCode", () => {
  it("acepta 2 o 3 letras + 3 digitos", () => {
    expect(validateProductCode("CAM001")).toEqual({ ok: true, code: "CAM001" });
    expect(validateProductCode("PE012")).toEqual({ ok: true, code: "PE012" });
  });

  it("pasa a mayusculas y quita espacios de los extremos", () => {
    expect(validateProductCode("  cam001 ")).toEqual({ ok: true, code: "CAM001" });
    expect(normalizeProductCode(null)).toBe("");
  });

  it("exige el codigo", () => {
    for (const value of ["", "   ", null, undefined]) {
      const result = validateProductCode(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("El codigo del producto es obligatorio");
    }
  });

  it("rechaza puntos, guiones y espacios con mensaje claro", () => {
    for (const value of ["CAM-001", "CAM.001", "CAM 001", "CAM_001"]) {
      const result = validateProductCode(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("no puede tener puntos, guiones ni espacios");
    }
  });

  it("rechaza formatos fuera de la regla", () => {
    for (const value of ["C001", "CAMA001", "CAM01", "CAM0001", "001CAM", "CÑM001"]) {
      expect(validateProductCode(value).ok).toBe(false);
    }
  });
});

describe("productCodeSchema", () => {
  it("devuelve el codigo normalizado o el error", () => {
    expect(productCodeSchema.parse("bar010")).toBe("BAR010");
    const failed = productCodeSchema.safeParse("BAR-010");
    expect(failed.success).toBe(false);
    if (!failed.success) expect(failed.error.issues[0].message).toContain("guiones");
  });
});
