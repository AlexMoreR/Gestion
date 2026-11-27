import { describe, expect, it } from "vitest";
import { ogImageUrl, parseOgSegments } from "./og-image";

describe("parseOgSegments", () => {
  it("acepta products y categories con un nombre simple", () => {
    expect(parseOgSegments(["products", "1782-abc.png"])).toEqual({ dir: "products", fileName: "1782-abc.png" });
    expect(parseOgSegments(["categories", "logo.JPG"])).toEqual({ dir: "categories", fileName: "logo.JPG" });
  });

  it("rechaza carpetas no permitidas", () => {
    expect(parseOgSegments(["otra", "x.png"])).toBeNull();
    expect(parseOgSegments(["receipts", "x.png"])).toBeNull();
  });

  it("rechaza '..', subcarpetas y extensiones raras", () => {
    expect(parseOgSegments(["products", "..", "x.png"])).toBeNull();
    expect(parseOgSegments(["products", "../../package.json"])).toBeNull();
    expect(parseOgSegments(["products", "a..png"])).toBeNull();
    expect(parseOgSegments(["products", "sub", "x.png"])).toBeNull();
    expect(parseOgSegments(["products", "a/b.png"])).toBeNull();
    expect(parseOgSegments(["products", "x.svg"])).toBeNull();
    expect(parseOgSegments(["products"])).toBeNull();
  });
});

describe("ogImageUrl", () => {
  it("convierte rutas relativas de products y categories", () => {
    expect(ogImageUrl("/uploads/products/x.png")).toBe("/og/products/x.png");
    expect(ogImageUrl("/uploads/categories/logo.webp?v=2")).toBe("/og/categories/logo.webp");
  });

  it("convierte URL absolutas de magilus.com y del sitio", () => {
    expect(ogImageUrl("https://magilus.com/uploads/products/x.png")).toBe("/og/products/x.png");
    expect(ogImageUrl("https://www.magilus.com/uploads/products/x.jpg")).toBe("/og/products/x.jpg");
    expect(ogImageUrl("http://localhost:3000/uploads/products/x.png", "http://localhost:3000")).toBe("/og/products/x.png");
  });

  it("devuelve null para URL externas, vacias u otras carpetas", () => {
    expect(ogImageUrl("https://otro.com/uploads/products/x.png")).toBeNull();
    expect(ogImageUrl("")).toBeNull();
    expect(ogImageUrl(null)).toBeNull();
    expect(ogImageUrl("/uploads/receipts/x.png")).toBeNull();
    expect(ogImageUrl("/uploads/products/sub/x.png")).toBeNull();
    expect(ogImageUrl("/opengraph-image")).toBeNull();
  });
});
