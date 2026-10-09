import { describe, expect, it } from "vitest";
import {
  buildProductSeoTitle,
  compactPriceLabel,
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
