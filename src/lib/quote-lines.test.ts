import { describe, expect, it } from "vitest";
import { aplicarEdicionCombo, distributeAmount, errorAlGuardarLineas, mismasLineas, resumenCombo } from "./quote-lines";

const linea = { productId: "p1", supplierId: null, quantity: 2, unitPrice: 1000, fulfillmentMode: "STOCK", notes: "x" };

describe("mismasLineas", () => {
  it("iguales aunque cambie el orden o el precio venga como texto decimal", () => {
    const otra = { ...linea, productId: "p2" };
    expect(mismasLineas([linea, otra], [otra, { ...linea, unitPrice: { toString: () => "1000.00" } }])).toBe(true);
  });
  it("distintas si cambia cantidad, precio, nota o número de líneas", () => {
    expect(mismasLineas([linea], [{ ...linea, quantity: 3 }])).toBe(false);
    expect(mismasLineas([linea], [{ ...linea, unitPrice: 999 }])).toBe(false);
    expect(mismasLineas([linea], [{ ...linea, notes: "y" }])).toBe(false);
    expect(mismasLineas([linea], [linea, linea])).toBe(false);
  });
  it("la imagen con colores no cuenta como cambio de la línea", () => {
    const con = { ...linea, notes: JSON.stringify({ _type: "quote-item-meta", color: "Crema", imagenColoresUrl: "/uploads/vista-color/a.webp" }) };
    const sin = { ...linea, notes: JSON.stringify({ _type: "quote-item-meta", color: "Crema" }) };
    expect(mismasLineas([con], [sin])).toBe(true);
    expect(mismasLineas([con], [{ ...sin, notes: JSON.stringify({ _type: "quote-item-meta", color: "Negro" }) }])).toBe(false);
  });
});

// Combo de 2 con una alterna ya elegida (p9 en lugar de la principal): 2 sillas + 1 tocador por combo.
const combo = [
  { uid: "a", productId: "silla", quantity: 4, unitPrice: 300000, discount: 60000, additionalCost: 20000, comboQuantity: 2, comboKey: "k" },
  { uid: "b", productId: "p9-alterna", quantity: 2, unitPrice: 400000, discount: 40000, additionalCost: 10001, comboQuantity: 2, comboKey: "k" },
];
const totalBruto = (lineas: typeof combo) => lineas.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

describe("resumenCombo", () => {
  it("precio por combo sin adicional ni descuento, y sumas", () => {
    expect(resumenCombo(combo)).toEqual({ quantity: 2, unitPrice: 1000000, discount: 100000, additionalCost: 30001 });
  });
});

describe("aplicarEdicionCombo", () => {
  it("abrir y guardar sin cambios deja las líneas idénticas", () => {
    expect(aplicarEdicionCombo(combo, resumenCombo(combo))).toEqual(combo);
  });
  it("cambio de cantidad: conserva piezas (alterna incluida), posición, uid y comboKey", () => {
    const nuevas = aplicarEdicionCombo(combo, { ...resumenCombo(combo), quantity: 3 });
    expect(nuevas.map((l) => [l.uid, l.productId, l.quantity, l.comboKey, l.comboQuantity])).toEqual([
      ["a", "silla", 6, "k", 3],
      ["b", "p9-alterna", 3, "k", 3],
    ]);
    expect(totalBruto(nuevas)).toBe(3000000);
    // El descuento y el adicional no cambiaron: no se reparten de nuevo.
    expect(nuevas.map((l) => l.discount)).toEqual([60000, 40000]);
    expect(nuevas.map((l) => l.additionalCost)).toEqual([20000, 10001]);
  });
  it("cambio de precio: la suma de las líneas da el total pedido", () => {
    const nuevas = aplicarEdicionCombo(combo, { ...resumenCombo(combo), unitPrice: 1200000 });
    expect(nuevas.map((l) => l.quantity)).toEqual([4, 2]);
    expect(totalBruto(nuevas)).toBe(2400000);
    expect(nuevas[0].unitPrice).toBe(360000);
  });
  it("cambio de descuento y adicional: se reparten y suman lo pedido, sin mover precios", () => {
    const nuevas = aplicarEdicionCombo(combo, { ...resumenCombo(combo), discount: 150000, additionalCost: 50000 });
    expect(nuevas.map((l) => [l.quantity, l.unitPrice])).toEqual([[4, 300000], [2, 400000]]);
    expect(nuevas.reduce((s, l) => s + l.discount, 0)).toBe(150000);
    expect(nuevas.reduce((s, l) => s + l.additionalCost, 0)).toBe(50000);
  });
  it("precio que no divide exacto: diferencia de centavos, como al agregar", () => {
    const uno = [{ ...combo[0], quantity: 1, comboQuantity: 1 }, { ...combo[1], quantity: 1, comboQuantity: 1 }, { ...combo[1], uid: "c", quantity: 1, comboQuantity: 1 }];
    const nuevas = aplicarEdicionCombo(uno, { ...resumenCombo(uno), quantity: 3, unitPrice: 1000000 / 3 });
    expect(Math.abs(totalBruto(nuevas) - 1000000)).toBeLessThan(0.05);
  });
});

describe("errorAlGuardarLineas", () => {
  const suelta = { etiqueta: "SIL001", requeridas: [], elegidos: [], combo: false, color: "", quantity: 2, unitPrice: 500000, discount: 0, additionalCost: 0 };
  // Combo de 1 a 1.000.000 con tres piezas de 333.333,33: la suma da 999.999,99.
  const pieza = { etiqueta: "CMB005", requeridas: [], elegidos: [], combo: true, color: "Crema", quantity: 1, unitPrice: 333333.33, discount: 0, additionalCost: 0, comboKey: "k" };
  const comboEntero = [
    { ...pieza, discount: 333333 },
    { ...pieza, discount: 333333 },
    { ...pieza, discount: 333334 },
  ];

  it("suelto válido (descuento hasta cantidad × precio + adicional)", () => {
    expect(errorAlGuardarLineas([{ ...suelta, discount: 1050000, additionalCost: 50000 }])).toBeNull();
  });
  it("descuento excedido en una línea suelta nombra el producto", () => {
    expect(errorAlGuardarLineas([{ ...suelta, discount: 1000001 }])).toBe(
      "El descuento de SIL001 ($1.000.001) no puede pasar de su valor ($1.000.000).",
    );
  });
  it("combo: el reparto redondeado sigue siendo válido aunque una pieza pase su valor", () => {
    expect(errorAlGuardarLineas(comboEntero)).toBeNull();
  });
  it("combo excedido sumando sus líneas", () => {
    expect(errorAlGuardarLineas([...comboEntero.slice(0, 2), { ...pieza, discount: 333336 }])).toMatch(/^El descuento de CMB005/);
  });
  it("combo sin color", () => {
    expect(errorAlGuardarLineas(comboEntero.map((l) => ({ ...l, color: " " })))).toBe("Falta escoger el color: CMB005");
  });
  it("parte en «Por definir»", () => {
    const conPartes = { ...suelta, requeridas: ["Tapizado", "Base"], elegidos: [{ parte: "Tapizado", color: "Crema" }, { parte: "Base", color: "Por definir" }] };
    expect(errorAlGuardarLineas([conPartes])).toBe("Falta escoger el color: SIL001 – Base");
  });
});

describe("distributeAmount", () => {
  it("suma exacta y proporcional", () => {
    expect(distributeAmount(100, [1, 1, 2])).toEqual([25, 25, 50]);
    expect(distributeAmount(10, [0, 0])).toEqual([5, 5]);
  });
});
