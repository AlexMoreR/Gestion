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

describe("getProductSeoContent — mesa MMV10", () => {
  const seo = getProductSeoContent("mesa-manicura-mmv10")!;
  const text = categorySeoParagraphText(seo.paragraph);

  it("trae el título y la descripción fijos y deja el H1 de siempre", () => {
    expect(seo.title).toBe("Mesa de manicura con doble esmaltero de fábrica");
    expect(`${seo.title} | Magilus`.length).toBeLessThanOrEqual(60);
    expect(seo.description).toBe(
      "Mesa de manicura con doble esmaltero, hecha por Magilus en Cali y Bogotá para salones de uñas. Mira fotos, medidas y precio y cotiza por WhatsApp.",
    );
    expect(seo.description.length).toBeLessThanOrEqual(155);
    expect(seo.h1).toBeUndefined();
  });

  it("párrafo de 120 a 200 palabras con las 3 frases y enlaces a /mesa-manicura y /esmalteros", () => {
    const words = text.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(120);
    expect(words).toBeLessThanOrEqual(200);
    for (const phrase of ["mesa manicura", "mesa de manicura", "mesa para uñas"]) {
      expect(text.toLowerCase()).toContain(phrase);
    }
    const links = seo.paragraph.filter((s) => typeof s !== "string").map((s) => s.href);
    expect(links).toEqual(["/mesa-manicura", "/esmalteros"]);
  });

  it("sin precios, cifras, envío gratis, descuentos ni garantías", () => {
    const all = `${seo.title} ${seo.description} ${text}`.toLowerCase();
    for (const banned of ["$", "%", "gratis", "descuento", "garantía"]) expect(all).not.toContain(banned);
    expect(all).not.toMatch(/\d/);
    expect(seo.title).not.toContain("Magilus");
  });

  it("otra ficha de la misma categoría no trae textos fijos", () => {
    expect(getProductSeoContent("mesa-manicura-mmv11")).toBeNull();
  });
});

describe("getProductSeoContent — mesa MMV03", () => {
  const seo = getProductSeoContent("mesa-manicura-mmv03")!;
  const text = categorySeoParagraphText(seo.paragraph);

  it("trae el título, la descripción y el H1 fijos", () => {
    expect(seo.title).toBe("Mesa de manicura sencilla de fábrica");
    expect(`${seo.title} | Magilus`.length).toBeLessThanOrEqual(60);
    expect(seo.description).toBe(
      "Mesa de manicura sencilla, hecha por Magilus en Cali y Bogotá para manicuristas y salones de uñas. Mira fotos, medidas y precio y cotiza por WhatsApp.",
    );
    expect(seo.description.length).toBeLessThanOrEqual(155);
    expect(seo.h1).toBe("Mesa de manicura sencilla");
  });

  it("párrafo de 120 a 200 palabras con las 3 frases y enlaces a /mesa-manicura y /esmalteros", () => {
    const words = text.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(120);
    expect(words).toBeLessThanOrEqual(200);
    for (const phrase of ["mesa manicura", "mesa de manicura", "mesa para uñas"]) {
      expect(text.toLowerCase()).toContain(phrase);
    }
    const links = seo.paragraph.filter((s) => typeof s !== "string").map((s) => s.href);
    expect(links).toEqual(["/mesa-manicura", "/esmalteros"]);
  });

  it("sin precios, cifras, envío gratis, descuentos ni garantías; título sin la marca", () => {
    const all = `${seo.title} ${seo.description} ${seo.h1} ${text}`.toLowerCase();
    for (const banned of ["$", "%", "gratis", "descuento", "garantía"]) expect(all).not.toContain(banned);
    expect(all).not.toMatch(/\d/);
    expect(seo.title).not.toContain("Magilus");
  });
});

describe("getProductSeoContent — tarima TPV01", () => {
  const seo = getProductSeoContent("tarima-para-pedicure-tpv01")!;
  const text = categorySeoParagraphText(seo.paragraph);

  it("trae el título, la descripción y el H1 fijos", () => {
    expect(seo.title).toBe("Tarima para pedicure de 1 puesto con puf, de fábrica");
    expect(seo.description).toBe(
      "Tarima para pedicure de 1 puesto con brazos y puf, hecha por Magilus en Cali y Bogotá. Mira fotos, medidas y precio y cotiza por WhatsApp.",
    );
    expect(seo.description.length).toBeLessThanOrEqual(155);
    expect(seo.h1).toBe("Tarima para pedicure de 1 puesto con puf");
  });

  it("párrafo de 80 a 200 palabras con las 2 frases y enlaces a /tarimas-pedicure y /butacos-mani-y-pedy", () => {
    const words = text.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(80);
    expect(words).toBeLessThanOrEqual(200);
    for (const phrase of ["tarima para pedicure", "tarima de pedicure"]) {
      expect(text.toLowerCase()).toContain(phrase);
    }
    const links = seo.paragraph.filter((s) => typeof s !== "string").map((s) => s.href);
    expect(links).toEqual(["/tarimas-pedicure", "/butacos-mani-y-pedy"]);
  });

  it("sin precios, envío gratis, contraentrega, descuentos ni garantías; título sin la marca", () => {
    const all = `${seo.title} ${seo.description} ${seo.h1} ${text}`.toLowerCase();
    for (const banned of ["$", "gratis", "contraentrega", "descuento", "garantía"]) {
      expect(all).not.toContain(banned);
    }
    expect(seo.title).not.toContain("Magilus");
  });

  it("otra tarima no trae textos fijos", () => {
    expect(getProductSeoContent("tarima-spa")).toBeNull();
  });
});

describe("getProductSeoContent — camilla CAV16", () => {
  const seo = getProductSeoContent("camilla-hidraulica-cav16")!;
  const text = categorySeoParagraphText(seo.paragraph);

  it("trae el título, la descripción y el H1 fijos, con tilde", () => {
    expect(seo.title).toBe("Camilla hidráulica de 3 cuerpos para spa y estética");
    expect(seo.h1).toBe("Camilla hidráulica de 3 cuerpos");
    expect(seo.description.length).toBeLessThanOrEqual(155);
  });

  it("párrafo con 'camilla hidráulica' y enlaces a /camilla y a la CAV14", () => {
    expect(text.toLowerCase()).toContain("camilla hidráulica");
    const links = seo.paragraph.filter((s) => typeof s !== "string").map((s) => s.href);
    expect(links).toEqual(["/camilla", "/camilla/camilla-curva-lashista-cav14"]);
  });

  it("sin precios, cifras de descuento, envío gratis ni garantías; título sin la marca", () => {
    const all = `${seo.title} ${seo.description} ${seo.h1} ${text}`.toLowerCase();
    for (const banned of ["$", "%", "gratis", "descuento", "garantía"]) expect(all).not.toContain(banned);
    expect(seo.title).not.toContain("Magilus");
  });
});
