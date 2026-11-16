import { describe, expect, it } from "vitest";
import { categorySeoParagraphText, getCategorySeoContent } from "./category-seo-content";

describe("textos SEO de /esmalteros", () => {
  const seo = getCategorySeoContent("esmalteros")!;
  const body = seo.paragraphs.map(categorySeoParagraphText).join(" ");
  const hrefs = seo.paragraphs.flat().flatMap((s) => (typeof s === "string" ? [] : [s.href]));

  it("título de máximo 60 caracteres que termina en la marca", () => {
    expect(seo.title.length).toBeLessThanOrEqual(60);
    expect(seo.title.endsWith("| Magilus")).toBe(true);
  });

  it("descripción de máximo 155 caracteres con tipos, envío y garantía", () => {
    expect(seo.description.length).toBeLessThanOrEqual(155);
    for (const word of ["de pared", "de pie", "con cajones", "envío a toda Colombia", "garantía de 1 año"]) {
      expect(seo.description).toContain(word);
    }
  });

  it("texto de 150 a 250 palabras con las búsquedas y los enlaces", () => {
    const words = body.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(150);
    expect(words).toBeLessThanOrEqual(250);
    for (const word of ["esmaltero", "esmaltero de pared", "organizador de esmaltes"]) {
      expect(body.toLowerCase()).toContain(word);
    }
    expect(hrefs).toEqual(["/mesa-manicura", "/tarimas-pedicure"]);
    expect(seo.h1).toBe("Esmalteros para salón de uñas");
  });

  it("sin precios ni envío gratis", () => {
    const all = [seo.title, seo.description, seo.h1, body, seo.altSuffix].join(" ").toLowerCase();
    expect(all).not.toMatch(/\$|precio|gratis/);
  });

  it("otras categorías no tienen texto fijo", () => {
    expect(getCategorySeoContent("mesa-manicura")).toBeNull();
    expect(getCategorySeoContent(undefined)).toBeNull();
  });
});
