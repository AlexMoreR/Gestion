import { describe, expect, it } from "vitest";
import { comboStock, faltanPiezasCombo, pareceCombo, pickComboPieces, type ComboComponent } from "./combo";

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

describe("pareceCombo / faltanPiezasCombo", () => {
  const sinPiezas = { isBundle: false, components: [] };
  it("detecta combos por codigo CMB o la palabra combo/kit", () => {
    expect(faltanPiezasCombo({ code: "CMB099", name: "KIT PRUEBA", ...sinPiezas })).toBe(true);
    expect(faltanPiezasCombo({ code: "BMV013", name: "COMBO MESA", ...sinPiezas })).toBe(true);
    expect(pareceCombo("cmb014", "CAMILLA TRES CUERPOS")).toBe(true);
    expect(pareceCombo("MYS001", "Kit-estética")).toBe(true);
  });
  it("no atrapa palabras que solo contienen kit/combo", () => {
    expect(pareceCombo("ACV001", "KITCHEN")).toBe(false);
    expect(pareceCombo("SIL001", "SILLA FLOR")).toBe(false);
    expect(faltanPiezasCombo({ code: "SIL001", name: "SILLA FLOR", ...sinPiezas })).toBe(false);
  });
  it("exige marcarlo combo y 2 unidades entre sus piezas", () => {
    expect(faltanPiezasCombo({ code: "CMB099", name: "KIT PRUEBA", isBundle: true, components: [{ quantity: 1 }] })).toBe(true);
    expect(faltanPiezasCombo({ code: "CMB099", name: "KIT PRUEBA", isBundle: true, components: [{ quantity: 2 }] })).toBe(false);
    expect(faltanPiezasCombo({ code: "CMB099", name: "KIT PRUEBA", isBundle: true, components: [{ quantity: 1 }, { quantity: 1 }] })).toBe(false);
    expect(faltanPiezasCombo({ code: "CMB099", name: "KIT PRUEBA", isBundle: false, components: [{ quantity: 2 }] })).toBe(true);
  });
});
