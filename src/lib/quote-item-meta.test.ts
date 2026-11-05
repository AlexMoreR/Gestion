import { describe, expect, it } from "vitest";
import { colorLabel, lineasSinColor, parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";

describe("color en las notas del producto", () => {
  it("un color escrito a mano sigue igual (mismo texto guardado y misma etiqueta)", () => {
    const viejo = JSON.stringify({
      _type: "quote-item-meta",
      description: "",
      color: "Rojo vino",
      additionalCost: 0,
      discount: 0,
      imageUrl: "",
      comboKey: "",
      comboName: "",
      comboCode: "",
      comboQuantity: 0,
    });
    const meta = parseQuoteItemMeta(viejo);
    expect(meta.colorCodigo).toBe("");
    expect(colorLabel(meta)).toBe("Rojo vino");
    expect(stringifyQuoteItemMeta(meta)).toBe(viejo);
  });

  it("un color de la carta del CRM se guarda y se lee completo", () => {
    const notas = stringifyQuoteItemMeta({
      color: "Negro",
      colorCodigo: "C-02",
      colorMaterial: "Cuerotex",
      colorFotoUrl: "https://crm.magilus.com/f/c2.jpg",
    });
    const meta = parseQuoteItemMeta(notas);
    expect(meta).toMatchObject({
      color: "Negro",
      colorCodigo: "C-02",
      colorMaterial: "Cuerotex",
      colorFotoUrl: "https://crm.magilus.com/f/c2.jpg",
    });
    expect(colorLabel(meta)).toBe("C-02 · Negro (Cuerotex)");
  });
});

describe("color por parte en las notas", () => {
  const partes = [
    { parte: "Tapizado", color: "Crema", colorCodigo: "C1", colorMaterial: "Cuero tex", colorFotoUrl: "", hex: "#F5F0E1" },
    { parte: "Base", color: "Dorada", colorCodigo: "", colorMaterial: "", colorFotoUrl: "", hex: "" },
  ];

  it("con partes, el color de texto es el de las partes y se leen completas", () => {
    const meta = parseQuoteItemMeta(stringifyQuoteItemMeta({ color: "Rojo", colorCodigo: "X", partes }));
    expect(meta.color).toBe("Tapizado: Crema · Base: Dorada");
    expect(meta.colorCodigo).toBe("");
    expect(meta.partes).toEqual(partes);
    expect(colorLabel(meta)).toBe("Tapizado: Crema · Base: Dorada");
  });

  it("una parte sin color queda en Por definir", () => {
    const meta = parseQuoteItemMeta(stringifyQuoteItemMeta({ partes: [{ ...partes[0], color: "" }] }));
    expect(meta.color).toBe("Tapizado: Por definir");
  });

  it("JSON viejo o partes mal formadas se leen sin fallar", () => {
    expect(parseQuoteItemMeta(JSON.stringify({ _type: "quote-item-meta", color: "Negro" })).partes).toEqual([]);
    const raro = JSON.stringify({ _type: "quote-item-meta", partes: [null, { color: 3 }, { parte: "Base", color: "Negra" }], imagenColoresUrl: 5 });
    const meta = parseQuoteItemMeta(raro);
    expect(meta.partes).toEqual([{ parte: "Base", color: "Negra", colorCodigo: "", colorMaterial: "", colorFotoUrl: "", hex: "" }]);
    expect(meta.imagenColoresUrl).toBe("");
  });

  it("imagenColoresUrl se guarda solo si trae algo", () => {
    expect(stringifyQuoteItemMeta({ color: "Negro" })).not.toContain("imagenColoresUrl");
    expect(parseQuoteItemMeta(stringifyQuoteItemMeta({ partes, imagenColoresUrl: "https://x/y.png" })).imagenColoresUrl).toBe("https://x/y.png");
  });
});

describe("lineasSinColor (antes de guardar la cotización)", () => {
  const parte = (nombre: string, color: string) => ({ parte: nombre, color });

  it("una parte en Por definir sale como 'CMB005 – Tapizado'", () => {
    expect(
      lineasSinColor([
        { etiqueta: "CMB005", requeridas: ["Tapizado"], elegidos: [parte("Tapizado", "Por definir")], combo: true, color: "" },
        { etiqueta: "CMB005", requeridas: ["Tapizado"], elegidos: [parte("Tapizado", "Por definir")], combo: true, color: "" },
      ]),
    ).toEqual(["CMB005 – Tapizado"]);
  });

  it("un combo sin partes y sin color sale con su etiqueta", () => {
    expect(
      lineasSinColor([
        { etiqueta: "CMB009", requeridas: [], elegidos: [], combo: true, color: "" },
        { etiqueta: "SIL01", requeridas: [], elegidos: [], combo: false, color: "" },
      ]),
    ).toEqual(["CMB009"]);
  });

  it("todo con color: vacío", () => {
    expect(
      lineasSinColor([
        { etiqueta: "CMB005", requeridas: ["Tapizado"], elegidos: [parte("Tapizado", "Crema")], combo: true, color: "Tapizado: Crema" },
        { etiqueta: "CMB009", requeridas: [], elegidos: [], combo: true, color: "Negro" },
      ]),
    ).toEqual([]);
  });
});
