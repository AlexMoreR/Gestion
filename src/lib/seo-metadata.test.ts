import { describe, expect, it } from "vitest";
import {
  buildCategorySeoDescription,
  buildCategorySeoTitle,
  buildHomeSeoTitle,
  buildProductSeoTitle,
  compactPriceLabel,
  expandProductNameForSeo,
  sitemapCategories,
  sitemapProducts,
  toSentenceCase,
  truncateMetaDescription,
} from "./seo-metadata";

describe("toSentenceCase", () => {
  it("pasa MAYUSCULAS a capitalizacion de oracion", () => {
    expect(toSentenceCase("CAMILLA CURVA LASHISTA")).toBe("Camilla curva lashista");
  });

  it("deja los codigos con digitos como estan", () => {
    expect(toSentenceCase("CAMILLA CAV14 3 CUERPOS")).toBe("Camilla CAV14 3 cuerpos");
  });

  it("respeta tildes y espacios repetidos", () => {
    expect(toSentenceCase("  ÉSTA   SILLA  BARBERA ")).toBe("Ésta silla barbera");
  });
});

describe("compactPriceLabel", () => {
  it("quita el espacio (incluso duro) tras el signo", () => {
    expect(compactPriceLabel("$ 1.099.000")).toBe("$1.099.000");
  });
});

describe("buildProductSeoTitle", () => {
  it("arma nombre | precio | marca", () => {
    expect(
      buildProductSeoTitle({ name: "CAMILLA CURVA LASHISTA", priceLabel: "$1.099.000", brandName: "Magilus" }),
    ).toBe("Camilla curva lashista | $1.099.000 | Magilus");
  });

  it("recorta el nombre por palabras sin pasar de 60 y sin conectores sueltos", () => {
    const title = buildProductSeoTitle({
      name: "COMBO CAMILLA 3 CUERPOS + SILLA + CARRITO + ESCALERA",
      priceLabel: "$1.549.000",
      brandName: "Magilus",
    });
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toBe("Combo camilla 3 cuerpos + silla | $1.549.000 | Magilus");
  });

  it("no corta a la mitad de una palabra", () => {
    const title = buildProductSeoTitle({
      name: "CAMILLA PARA SPA EN MADERA CON BAUL Y CABECERO",
      priceLabel: "$1.679.000",
      brandName: "Magilus",
    });
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(" | $1.679.000 | Magilus")).toBe(true);
    expect(title).toBe("Camilla para spa en madera con baul | $1.679.000 | Magilus");
  });
});

describe("expandProductNameForSeo", () => {
  it("NEUT -> Silla neumática y HIDRAU -> Silla hidráulica", () => {
    expect(expandProductNameForSeo("NEUT PLATINA", "Sillas Neumáticas")).toBe("Silla neumática PLATINA");
    expect(expandProductNameForSeo("HIDRAU PRO REY", "Sillas Hidráulicas")).toBe("Silla hidráulica PRO REY");
  });

  it("en butacos dice Butaco neumático (también con BUTACO NEUT)", () => {
    expect(expandProductNameForSeo("NEUT CORAZON  ALTA", "Butacos Maní y Pedí")).toBe("Butaco neumático CORAZON ALTA");
    expect(expandProductNameForSeo("BUTACO NEUT CUADRADO", "Butacos Maní y Pedí")).toBe("Butaco neumático CUADRADO");
  });

  it("no toca otros nombres ni NEUT en medio", () => {
    expect(expandProductNameForSeo("CAMILLA HIDRAULICA", "Camillas de Masaje")).toBe("CAMILLA HIDRAULICA");
    expect(expandProductNameForSeo("CUADRADO NEUT B", "Butacos Maní y Pedí")).toBe("CUADRADO NEUT B");
    expect(expandProductNameForSeo("NEUTRO X", null)).toBe("NEUTRO X");
  });

  it("se usa en el title de la ficha", () => {
    expect(
      buildProductSeoTitle({
        name: "HIDRAU PRO REY",
        categoryName: "Sillas Hidráulicas",
        priceLabel: "$1.199.000",
        brandName: "Magilus",
      }),
    ).toBe("Silla hidráulica pro rey | $1.199.000 | Magilus");
    expect(
      buildProductSeoTitle({ name: "NEUT PLATINA", categoryName: "Sillas Neumáticas", priceLabel: "$979.000", brandName: "Magilus" }),
    ).toBe("Silla neumática platina | $979.000 | Magilus");
  });
});

describe("buildCategorySeoTitle", () => {
  it("nombre en minuscula normal + precio mas bajo", () => {
    expect(
      buildCategorySeoTitle({ categoryName: "COMBO DE CAMILLAS", minPriceLabel: "$539.000", brandName: "Magilus" }),
    ).toBe("Combo de camillas desde $539.000 | Magilus");
  });

  it("sin precio queda solo nombre | marca", () => {
    expect(buildCategorySeoTitle({ categoryName: "MESA MANICURA", minPriceLabel: null, brandName: "Magilus" })).toBe(
      "Mesa manicura | Magilus",
    );
  });

  it("nunca pasa de 60 car.", () => {
    const title = buildCategorySeoTitle({
      categoryName: "POLTRONAS TIPO SPA PARA PEDICURE Y MANICURE PROFESIONAL DE LUJO",
      minPriceLabel: "$1.299.000",
      brandName: "Magilus",
    });
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(" desde $1.299.000 | Magilus")).toBe(true);
  });
});

describe("buildCategorySeoDescription", () => {
  it("cuenta modelos y rango de precios, sin promesas de envio", () => {
    const text = buildCategorySeoDescription({
      categoryName: "Butacos Maní y Pedí",
      productCount: 22,
      minPriceLabel: "$349.000",
      maxPriceLabel: "$469.000",
    });
    expect(text).toBe(
      "22 modelos de butacos maní y pedí de $349.000 a $469.000. Fábrica en Cali y Bogotá. Cotiza por WhatsApp.",
    );
    expect(text).not.toMatch(/env[ií]o/i);
  });

  it("un solo modelo o mismo precio", () => {
    expect(
      buildCategorySeoDescription({ categoryName: "CAMILLA", productCount: 1, minPriceLabel: "$999.000", maxPriceLabel: "$999.000" }),
    ).toBe("1 modelo de camilla por $999.000. Fábrica en Cali y Bogotá. Cotiza por WhatsApp.");
  });
});

describe("buildHomeSeoTitle", () => {
  it("cabe en 60 car. y usa 'muebles'", () => {
    const title = buildHomeSeoTitle("Magilus");
    expect(title).toBe("Magilus | Fábrica de muebles para peluquería, barbería y spa");
    expect(title.length).toBeLessThanOrEqual(60);
  });
});

describe("truncateMetaDescription", () => {
  it("no toca textos cortos", () => {
    expect(truncateMetaDescription("Camilla en madera.")).toBe("Camilla en madera.");
  });

  it("recorta a 155 car. por palabras con puntos suspensivos", () => {
    const long = "palabra ".repeat(40);
    const result = truncateMetaDescription(long);
    expect(result.length).toBeLessThanOrEqual(155);
    expect(result.endsWith("palabra…")).toBe(true);
  });
});

describe("sitemap", () => {
  const updatedAt = new Date("2026-10-08T00:00:00Z");

  it("omite productos sin categoria (no tienen URL canonica)", () => {
    const result = sitemapProducts([
      { id: "1", slug: "a", name: "A", updatedAt, category: { slug: "camilla" } },
      { id: "2", slug: "b", name: "B", updatedAt, category: null },
    ]);
    expect(result.map((product) => product.id)).toEqual(["1"]);
  });

  it("omite categorias sin productos visibles", () => {
    const result = sitemapCategories([
      { slug: "camilla", updatedAt, activeProductCount: 5 },
      { slug: "tapizados", updatedAt, activeProductCount: 0 },
    ]);
    expect(result.map((category) => category.slug)).toEqual(["camilla"]);
  });
});
