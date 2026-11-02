import { describe, expect, it } from "vitest";

import { buildPreciosVigentes, type PrecioVigenteInput } from "./precios-vigentes";

const base: PrecioVigenteInput = {
  id: "p",
  code: "P1",
  name: "Producto",
  categoryName: "Sillas",
  isBundle: false,
  hiddenFromStore: false,
  price: 100000,
  baseCost: 60000,
};
const now = new Date("2026-11-02T03:30:00Z"); // 1-nov-2026 22:30 en Colombia

function productLines(markdown: string): string[] {
  return markdown.split("\n").filter((line) => line.startsWith("- "));
}

describe("buildPreciosVigentes", () => {
  it("pone primero el más vendido y desempata por nombre", () => {
    const products = [
      { ...base, id: "a", code: "A", name: "Zeta" },
      { ...base, id: "b", code: "B", name: "Beta" },
      { ...base, id: "c", code: "C", name: "Alfa" },
      { ...base, id: "d", code: "D", name: "Gama" },
    ];
    const lines = productLines(buildPreciosVigentes(products, new Map([["a", 5], ["b", 2], ["d", 2]]), now));
    expect(lines.map((line) => line.split(" — ")[1])).toEqual(["Zeta", "Beta", "Gama", "Alfa"]);
  });

  it("combo dice Combo y sin categoría dice Producto", () => {
    const lines = productLines(
      buildPreciosVigentes(
        [
          { ...base, id: "a", name: "A", isBundle: true },
          { ...base, id: "b", name: "B", categoryName: null },
          { ...base, id: "c", name: "C" },
        ],
        new Map(),
        now,
      ),
    );
    expect(lines.map((line) => line.split(" — ")[2])).toEqual(["Combo", "Producto", "Sillas"]);
  });

  it("muestra precio y costo en COP con el formato de código — nombre — qué es — precio — costo", () => {
    const [line] = productLines(buildPreciosVigentes([{ ...base, price: 1250000, baseCost: 830000 }], new Map(), now));
    expect(line.replace(/\s/g, " ")).toBe("- P1 — Producto — Sillas — $ 1.250.000 — $ 830.000");
  });

  it("no incluye productos ocultos de la tienda", () => {
    const markdown = buildPreciosVigentes([{ ...base, name: "Oculto", hiddenFromStore: true }], new Map(), now);
    expect(productLines(markdown)).toEqual([]);
    expect(markdown).not.toContain("Oculto");
  });

  it("pone la fecha y hora de Colombia", () => {
    expect(buildPreciosVigentes([], new Map(), now)).toContain(
      "Generado: 2026-11-01 22:30 (hora de Colombia) · precio y costo de Gestión",
    );
  });
});
