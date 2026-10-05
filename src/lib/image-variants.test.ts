import { describe, expect, it } from "vitest";
import {
  IMAGE_VARIANT_DIRS,
  IMAGE_VARIANT_QUALITY,
  IMAGE_VARIANT_WIDTHS,
  imageVariantSrcSet,
  imageVariantUrl,
  parseVariantFileName,
  variantFileName,
} from "./image-variants";
import * as batchScript from "../../scripts/generate-image-variants.mjs";

describe("image variants", () => {
  it("el script de conversion en lote usa las mismas medidas que la app", () => {
    expect(batchScript.VARIANT_WIDTHS).toEqual(Object.values(IMAGE_VARIANT_WIDTHS));
    expect(batchScript.VARIANT_QUALITY).toBe(IMAGE_VARIANT_QUALITY);
    expect(batchScript.VARIANT_DIRS).toEqual([...IMAGE_VARIANT_DIRS]);
    expect(batchScript.variantName("a.png", 400)).toBe(variantFileName("a.png", 400));
  });

  it("nombra las versiones junto al original", () => {
    expect(variantFileName("1782-abc.png", 400)).toBe("1782-abc.w400.webp");
    expect(variantFileName("foto.JPEG", 1200)).toBe("foto.w1200.webp");
    expect(variantFileName("logo.svg", 400)).toBeNull();
    expect(variantFileName("x.w400.webp", 400)).toBeNull();
  });

  it("reconoce solo versiones con medidas validas", () => {
    expect(parseVariantFileName("1782-abc.w400.webp")).toEqual({ baseName: "1782-abc", width: 400 });
    expect(parseVariantFileName("1782-abc.w1200.webp")).toEqual({ baseName: "1782-abc", width: 1200 });
    expect(parseVariantFileName("1782-abc.w999.webp")).toBeNull();
    expect(parseVariantFileName("1782-abc.png")).toBeNull();
  });

  it("reescribe solo URLs de productos y categorias", () => {
    expect(imageVariantUrl("https://magilus.com/uploads/products/a.png", "thumb")).toBe(
      "https://magilus.com/uploads/products/a.w400.webp",
    );
    expect(imageVariantUrl("/uploads/categories/b.jpg", "large")).toBe("/uploads/categories/b.w1200.webp");
    expect(imageVariantUrl("/uploads/receipts/c.png", "thumb")).toBe("/uploads/receipts/c.png");
    expect(imageVariantUrl("/uploads/products/d.gif", "thumb")).toBe("/uploads/products/d.gif");
    expect(imageVariantUrl("https://otro.com/e.png", "thumb")).toBe("https://otro.com/e.png");
    expect(imageVariantUrl("", "thumb")).toBe("");
  });

  it("arma el srcset con las dos versiones", () => {
    expect(imageVariantSrcSet("/uploads/products/a.png")).toBe(
      "/uploads/products/a.w400.webp 400w, /uploads/products/a.w1200.webp 1200w",
    );
    expect(imageVariantSrcSet("/file.svg")).toBeUndefined();
  });
});
