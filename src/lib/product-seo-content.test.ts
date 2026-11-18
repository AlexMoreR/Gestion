import { describe, expect, it } from "vitest";
import { categorySeoParagraphText } from "./category-seo-content";
import { getProductSeoContent } from "./product-seo-content";

const SLUG = "camilla-fija-de-madera-con-cajones-cav11";

describe("getProductSeoContent", () => {
  const seo = getProductSeoContent(SLUG)!;
  const text = categorySeoParagraphText(seo.paragraph);

  it("trae los textos fijos de la CAV11", () => {
    expect(seo.title).toBe("Camilla fija de madera con cajones para masajes");
    expect(seo.h1).toBe("Camilla fija de madera con cajones para masajes");
  });

  it("descripción de 155 caracteres o menos", () => {
    expect(seo.description.length).toBeLessThanOrEqual(155);
  });

  it("párrafo de 120 a 200 palabras con las 3 frases y enlace a /camilla", () => {
    const words = text.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(120);
    expect(words).toBeLessThanOrEqual(200);
    for (const phrase of ["camilla de madera", "camilla fija para masajes", "camilla con cajones"]) {
      expect(text).toContain(phrase);
    }
    expect(seo.paragraph.some((s) => typeof s !== "string" && s.href === "/camilla")).toBe(true);
  });

  it("sin precios, envío gratis, descuentos ni garantías; título sin la marca", () => {
    const all = `${seo.title} ${seo.description} ${seo.h1} ${text}`.toLowerCase();
    for (const banned of ["$", "gratis", "descuento", "garantía"]) expect(all).not.toContain(banned);
    expect(seo.title).not.toContain("Magilus");
  });

  it("un slug que no está en la tabla devuelve null", () => {
    expect(getProductSeoContent("camilla-curva-cav14")).toBeNull();
    expect(getProductSeoContent(undefined)).toBeNull();
    expect(getProductSeoContent("constructor")).toBeNull();
  });
});
