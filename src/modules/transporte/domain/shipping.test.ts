import { describe, expect, it } from "vitest";

import {
  normalizePlaceName,
  parseShippingExtraInput,
  quoteShipping,
  resolveProductShippingExtra,
  resolveShippingType,
} from "./shipping";

describe("normalizePlaceName", () => {
  it("quita acentos, espacios de mas y mayusculas", () => {
    expect(normalizePlaceName("  Bogotá,   D.C. ")).toBe("bogota, d.c.");
    expect(normalizePlaceName("CHÍA")).toBe("chia");
    expect(normalizePlaceName("Ibagué")).toBe(normalizePlaceName("ibague"));
    expect(normalizePlaceName("Nariño")).toBe("narino");
  });
});

describe("resolveShippingType", () => {
  it("usa el tipo propio si existe", () => {
    expect(resolveShippingType({ shippingType: "NO_LLEGA", freeShipping: true })).toBe("NO_LLEGA");
  });
  it("hereda el tipo de la ciudad", () => {
    expect(
      resolveShippingType({
        shippingType: null,
        freeShipping: false,
        parent: { shippingType: "ADICIONAL", freeShipping: false },
      }),
    ).toBe("ADICIONAL");
  });
  it("sin tipo: freeShipping decide como siempre", () => {
    expect(resolveShippingType({ shippingType: null, freeShipping: true })).toBe("GRATIS");
    expect(resolveShippingType({ shippingType: null, freeShipping: false })).toBe("COTIZAR");
    expect(
      resolveShippingType({ shippingType: null, freeShipping: false, parent: { shippingType: null, freeShipping: true } }),
    ).toBe("GRATIS");
  });
});

describe("resolveProductShippingExtra", () => {
  it("el producto pisa a la categoria", () => {
    expect(resolveProductShippingExtra({ shippingExtra: 70000, categoryShippingExtra: 100000 })).toBe(70000);
    expect(resolveProductShippingExtra({ shippingExtra: null, categoryShippingExtra: 50000 })).toBe(50000);
    expect(resolveProductShippingExtra({ shippingExtra: null, categoryShippingExtra: null })).toBeNull();
  });
});

describe("parseShippingExtraInput", () => {
  it("acepta numeros con o sin puntos de miles", () => {
    expect(parseShippingExtraInput("100000")).toBe(100000);
    expect(parseShippingExtraInput("100.000")).toBe(100000);
    expect(parseShippingExtraInput(" $ 50.000 ")).toBe(50000);
    expect(parseShippingExtraInput("0")).toBe(0);
  });
  it("vacio = null (se cotiza)", () => {
    expect(parseShippingExtraInput("")).toBeNull();
    expect(parseShippingExtraInput("   ")).toBeNull();
    expect(parseShippingExtraInput(null)).toBeNull();
  });
  it("rechaza lo invalido", () => {
    expect(parseShippingExtraInput("abc")).toBeUndefined();
    expect(parseShippingExtraInput("-5000")).toBeUndefined();
    expect(parseShippingExtraInput("100,5")).toBeUndefined();
    expect(parseShippingExtraInput("99999999")).toBeUndefined();
  });
});

describe("quoteShipping", () => {
  it("gratis: total = precio", () => {
    expect(quoteShipping({ tipo: "GRATIS", price: 989000, shippingExtra: 100000 })).toEqual({
      tipo: "GRATIS",
      envio: 0,
      total: 989000,
    });
  });
  it("adicional: un solo total", () => {
    expect(quoteShipping({ tipo: "ADICIONAL", price: 989000, shippingExtra: 100000 })).toEqual({
      tipo: "ADICIONAL",
      envio: 100000,
      total: 1089000,
    });
  });
  it("adicional sin valor cargado: se cotiza, nunca inventa", () => {
    expect(quoteShipping({ tipo: "ADICIONAL", price: 989000, shippingExtra: null })).toEqual({
      tipo: "COTIZAR",
      envio: null,
      total: null,
    });
  });
  it("cotizar y no llega: sin total", () => {
    expect(quoteShipping({ tipo: "COTIZAR", price: 989000, shippingExtra: 100000 }).total).toBeNull();
    expect(quoteShipping({ tipo: "NO_LLEGA", price: 989000, shippingExtra: 100000 }).total).toBeNull();
  });
});
