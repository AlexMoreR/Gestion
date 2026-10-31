import { describe, expect, it } from "vitest";
import { comboStock, pickComboPieces, type ComboComponent } from "./combo";

// CMB005: divan, escalera, carrito y butaco BMV016 (alterna BMV003).
const stock: Record<string, number> = { CAV002: 2, ACV002: 2, ACV009: 2, BMV016: 0, BMV003: 2 };
const stockOf = (id: string) => stock[id] ?? 0;
const pieces = [
  { childId: "CAV002", quantity: 1 },
  { childId: "ACV002", quantity: 1 },
  { childId: "ACV009", quantity: 1 },
  { childId: "BMV016", quantity: 1, alternates: [{ productId: "BMV003" }] },
];

function piece(productId: string, alternates?: ComboComponent[]): ComboComponent {
  return { productId, name: productId, code: productId, quantity: 1, retailPrice: 100, stock: stock[productId] ?? 0, alternates };
}

describe("comboStock", () => {
  it("suma la alterna al stock de la pieza", () => {
    expect(comboStock(pieces, stockOf)).toBe(2);
  });

  it("sin alternas da lo mismo que antes (minimo de las piezas)", () => {
    expect(comboStock(pieces.map(({ childId, quantity }) => ({ childId, quantity })), stockOf)).toBe(0);
  });

  it("combo sin piezas da 0", () => {
    expect(comboStock([], stockOf)).toBe(0);
  });
});

describe("pickComboPieces", () => {
  const butaco = piece("BMV016", [piece("BMV003")]);

  it("cambia a la alterna cuando la principal no alcanza", () => {
    expect(pickComboPieces([piece("CAV002"), butaco], 2).map((p) => p.productId)).toEqual(["CAV002", "BMV003"]);
  });

  it("deja la principal cuando alcanza", () => {
    const withStock = { ...butaco, stock: 3 };
    expect(pickComboPieces([withStock], 2)[0].productId).toBe("BMV016");
  });

  it("deja la principal cuando ninguna alcanza", () => {
    expect(pickComboPieces([butaco], 3)[0].productId).toBe("BMV016");
  });

  it("la alterna lleva la cantidad por combo de la principal", () => {
    const doble = { ...butaco, quantity: 2 };
    expect(pickComboPieces([doble], 1)[0]).toMatchObject({ productId: "BMV003", quantity: 2 });
  });
});
