import { describe, expect, it } from "vitest";
import { buildPreciosVigentes, type PrecioVigenteProduct } from "./precios-vigentes";

function product(overrides: Partial<PrecioVigenteProduct> & { id: string; name: string }): PrecioVigenteProduct {
  return {
    code: overrides.id.toUpperCase(),
    categoryName: "Camillas",
    isBundle: false,
    hiddenFromStore: false,
    price: 100_000,
    baseCost: 60_000,
    ...overrides,
  };
}

const NOW = new Date("2026-10-31T03:30:00Z"); // 30-oct 22:30 en Colombia

function productLines(markdown: string): string[] {
  return markdown.split("\n").filter((line) => line.startsWith("- "));
}

describe("buildPreciosVigentes", () => {
  it("pone primero el mas vendido y desempata por nombre", () => {
    const markdown = buildPreciosVigentes(
      [
        product({ id: "a", name: "Zeta sin ventas" }),
        product({ id: "b", name: "Beta" }),
        product({ id: "c", name: "Alfa" }),
        product({ id: "d", name: "Estrella" }),
      ],
      new Map([
        ["b", 3],
        ["c", 3],
        ["d", 9],
      ]),
      NOW,
    );
    const names = productLines(markdown).map((line) => line.split(" — ")[1]);
    expect(names).toEqual(["Estrella", "Alfa", "Beta", "Zeta sin ventas"]);
  });

  it("dice Combo, la categoria o Producto", () => {
    const lines = productLines(
      buildPreciosVigentes(
        [
          product({ id: "a", name: "A combo", isBundle: true }),
          product({ id: "b", name: "B camilla" }),
          product({ id: "c", name: "C suelto", categoryName: null }),
        ],
        new Map(),
        NOW,
      ),
    );
    expect(lines.map((line) => line.split(" — ")[2])).toEqual(["Combo", "Camillas", "Producto"]);
  });

  it("formatea precio y costo en COP", () => {
    const [line] = productLines(
      buildPreciosVigentes([product({ id: "cav04", name: "Camilla", price: 659_000, baseCost: 400_000 })], new Map(), NOW),
    );
    expect(line).toMatch(/^- CAV04 — Camilla — Camillas — \$\s?659\.000 — \$\s?400\.000$/);
  });

  it("no muestra productos ocultos de la tienda", () => {
    const markdown = buildPreciosVigentes(
      [product({ id: "a", name: "Visible" }), product({ id: "b", name: "Oculto", hiddenFromStore: true })],
      new Map([["b", 50]]),
      NOW,
    );
    expect(productLines(markdown)).toHaveLength(1);
    expect(markdown).not.toContain("Oculto");
  });

  it("usa la hora de Colombia en la linea Generado", () => {
    const markdown = buildPreciosVigentes([], new Map(), NOW);
    expect(markdown).toContain("Generado: 2026-10-30 22:30 (hora de Colombia) · precio y costo de Gestión");
  });
});
