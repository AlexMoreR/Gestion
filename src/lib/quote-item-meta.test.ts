import { describe, expect, it } from "vitest";
import { colorLabel, parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";

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
