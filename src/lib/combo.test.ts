import { describe, expect, it } from "vitest";
import { comboStock, pickComboPieces, type ComboComponent } from "./combo";

// CMB005: divan, escalera, carrito y butaco (BMV016, alterna BMV003).
const stock: Record<string, number> = { CAV002: 2, ACV002: 2, ACV009: 2, BMV016: 0, BMV003: 2 };
const stockOf = (id: string) => stock[id] ?? 0;
const piezas = [
  { childId: "CAV002", quantity: 1 },
  { childId: "ACV002", quantity: 1 },
  { childId: "ACV009", quantity: 1 },
];

describe("comboStock", () => {
  it("suma la alterna al stock de la pieza", () => {
    expect(comboStock([...piezas, { childId: "BMV016", quantity: 1, alternates: [{ productId: "BMV003" }] }], stockOf)).toBe(2);
  });

  it("sin alternas da lo mismo que antes (minimo de las piezas)", () => {
    expect(comboStock([...piezas, { childId: "BMV016", quantity: 1 }], stockOf)).toBe(0);
    expect(comboStock(piezas, stockOf)).toBe(2);
    expect(comboStock([{ childId: "CAV002", quantity: 2 }], stockOf)).toBe(1);
    expect(comboStock([], stockOf)).toBe(0);
  });
});

describe("pickComboPieces", () => {
  const butaco = (principalStock: number, altStock: number): ComboComponent => ({
    productId: "BMV016",
    name: "NEUT CORAZON ALTA",
    code: "BMV016",
    quantity: 1,
    retailPrice: 100,
    stock: principalStock,
    alternates: [{ productId: "BMV003", name: "NEUT CUADRADO", code: "BMV003", retailPrice: 90, stock: altStock }],
  });

  it("cambia a la alterna cuando la principal no alcanza", () => {
    const [pieza] = pickComboPieces([butaco(0, 2)], 2);
    expect(pieza).toMatchObject({ productId: "BMV003", code: "BMV003", retailPrice: 90, quantity: 1 });
  });

  it("deja la principal cuando alcanza", () => {
    expect(pickComboPieces([butaco(2, 2)], 2)[0].productId).toBe("BMV016");
  });

  it("deja la principal cuando ninguna alcanza", () => {
    expect(pickComboPieces([butaco(1, 1)], 2)[0].productId).toBe("BMV016");
  });
});
