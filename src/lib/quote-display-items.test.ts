import { describe, expect, it } from "vitest";
import type { QuoteItemMeta } from "./quote-item-meta";
import { groupQuoteDisplayItems, type QuoteDisplayItemInput } from "./quote-display-items";

const emptyMeta: QuoteItemMeta = {
  description: "",
  color: "",
  additionalCost: 0,
  discount: 0,
  imageUrl: "",
  comboKey: "",
  comboName: "",
  comboCode: "",
  comboQuantity: 0,
  colorCodigo: "",
  colorMaterial: "",
  colorFotoUrl: "",
  partes: [],
  imagenColoresUrl: "",
};

function quoteItem(input: Partial<QuoteDisplayItemInput> & { id: string }): QuoteDisplayItemInput {
  return {
    quantity: 1,
    unitPrice: 0,
    lineTotal: 0,
    product: {
      name: "Producto",
      code: null,
      thumbnailUrl: "",
      description: null,
    },
    meta: emptyMeta,
    ...input,
  };
}

describe("groupQuoteDisplayItems", () => {
  it("keeps regular products as individual rows", () => {
    const result = groupQuoteDisplayItems([
      quoteItem({
        id: "line-1",
        quantity: 2,
        unitPrice: 100,
        lineTotal: 200,
        product: {
          name: "Silla",
          code: "SIL01",
          thumbnailUrl: "/uploads/silla.jpg",
          description: "Tapizada",
        },
      }),
    ]);

    expect(result).toMatchObject([
      {
        quantity: 2,
        productName: "Silla",
        productCode: "SIL01",
        unitPrice: 100,
        lineTotal: 200,
        observation: "Tapizada",
      },
    ]);
  });

  it("groups combo components into one row with the real combo code", () => {
    const result = groupQuoteDisplayItems([
      quoteItem({
        id: "line-1",
        quantity: 1,
        unitPrice: 234436,
        lineTotal: 253399,
        product: {
          name: "Carrito auxiliar",
          code: "ACV09",
          thumbnailUrl: "/uploads/carrito.jpg",
          description: "Componente",
        },
        meta: {
          ...emptyMeta,
          description: "Combo camilla fija color negro",
          imageUrl: "/uploads/combo.jpg",
          comboKey: "combo-1",
          comboName: "Camilla fija color negro",
          comboCode: "CAM-FIJA-NEGRA",
          comboQuantity: 1,
        },
      }),
      quoteItem({
        id: "line-2",
        quantity: 1,
        unitPrice: 83187,
        lineTotal: 89916,
        product: {
          name: "Escalera de dos pasos",
          code: "ACV02",
          thumbnailUrl: "/uploads/escalera.jpg",
          description: "Componente",
        },
        meta: {
          ...emptyMeta,
          description: "Combo camilla fija color negro",
          comboKey: "combo-1",
          comboName: "Camilla fija color negro",
          comboCode: "CAM-FIJA-NEGRA",
          comboQuantity: 1,
        },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      quantity: 1,
      productName: "Camilla fija color negro",
      productCode: "CAM-FIJA-NEGRA",
      description: "Combo camilla fija color negro",
      unitPrice: 343315,
      lineTotal: 343315,
      imageUrl: "/uploads/combo.jpg",
      observation: "Combo camilla fija color negro",
    });
    expect(result[0].productCode).not.toMatch(/^CMB/i);
  });

  it("does not invent a combo code when the combo has no code", () => {
    const result = groupQuoteDisplayItems([
      quoteItem({
        id: "line-1",
        lineTotal: 100,
        meta: {
          ...emptyMeta,
          comboKey: "combo-2",
          comboName: "Combo sin codigo",
          comboQuantity: 1,
        },
      }),
    ]);

    expect(result[0].productCode).toBeNull();
  });

  it("uses the combo product image before falling back to component images", () => {
    const result = groupQuoteDisplayItems([
      quoteItem({
        id: "line-1",
        lineTotal: 100,
        comboImageUrl: "/uploads/combo-real.jpg",
        product: {
          name: "Componente",
          code: "CMP01",
          thumbnailUrl: "/uploads/componente.jpg",
          description: null,
        },
        meta: {
          ...emptyMeta,
          comboKey: "combo-3",
          comboName: "Combo real",
          comboCode: "CMB05",
          comboQuantity: 1,
        },
      }),
    ]);

    expect(result[0].imageUrl).toBe("/uploads/combo-real.jpg");
  });

  it("keeps a custom quote image over the combo product image", () => {
    const result = groupQuoteDisplayItems([
      quoteItem({
        id: "line-1",
        lineTotal: 100,
        comboImageUrl: "/uploads/combo-real.jpg",
        meta: {
          ...emptyMeta,
          imageUrl: "/uploads/foto-personalizada.jpg",
          comboKey: "combo-4",
          comboName: "Combo real",
          comboCode: "CMB05",
          comboQuantity: 1,
        },
      }),
    ]);

    expect(result[0].imageUrl).toBe("/uploads/foto-personalizada.jpg");
  });

  describe("colores para la cotización del cliente", () => {
    const carta = { ...emptyMeta, color: "Crema", colorCodigo: "T12", colorMaterial: "Sintético", colorFotoUrl: "https://crm/t12.jpg" };

    it("color de la carta: 'T12 · Crema (Sintético)' con su foto", () => {
      const [row] = groupQuoteDisplayItems([quoteItem({ id: "l1", meta: carta })]);
      expect(row.colores).toEqual([{ texto: "T12 · Crema (Sintético)", fotoUrl: "https://crm/t12.jpg" }]);
    });

    it("color escrito a mano: solo el texto, sin foto", () => {
      const [row] = groupQuoteDisplayItems([quoteItem({ id: "l1", meta: { ...emptyMeta, color: "Vinotinto" } })]);
      expect(row.colores).toEqual([{ texto: "Vinotinto", fotoUrl: "" }]);
    });

    const combo = { ...emptyMeta, comboKey: "k1", comboName: "Combo", comboCode: "CMB005", comboQuantity: 1 };
    const pieza = (id: string, name: string, meta: QuoteItemMeta) =>
      quoteItem({ id, product: { name, code: null, thumbnailUrl: "", description: null }, meta });

    it("combo con un solo color: una sola entrada", () => {
      const [row] = groupQuoteDisplayItems([
        pieza("a", "Camilla", { ...combo, ...carta, comboKey: "k1" }),
        pieza("b", "Butaco", { ...combo, ...carta, comboKey: "k1" }),
      ]);
      expect(row.colores).toEqual([{ texto: "T12 · Crema (Sintético)", fotoUrl: "https://crm/t12.jpg" }]);
    });

    it("combo con dos colores: una entrada por pieza con su nombre", () => {
      const [row] = groupQuoteDisplayItems([
        pieza("a", "Camilla", { ...combo, ...carta, comboKey: "k1" }),
        pieza("b", "Butaco", { ...combo, comboKey: "k1", color: "Negro" }),
      ]);
      expect(row.colores).toEqual([
        { texto: "Camilla: T12 · Crema (Sintético)", fotoUrl: "https://crm/t12.jpg" },
        { texto: "Butaco: Negro", fotoUrl: "" },
      ]);
    });

    it("con partes: una entrada por parte", () => {
      const [row] = groupQuoteDisplayItems([
        quoteItem({
          id: "l1",
          meta: {
            ...emptyMeta,
            partes: [
              { parte: "Tapizado", color: "Crema", colorCodigo: "T12", colorMaterial: "Sintético", colorFotoUrl: "f.jpg", hex: "" },
              { parte: "Base", color: "", colorCodigo: "", colorMaterial: "", colorFotoUrl: "", hex: "" },
            ],
          },
        }),
      ]);
      expect(row.colores).toEqual([
        { texto: "Tapizado: T12 · Crema (Sintético)", fotoUrl: "f.jpg" },
        { texto: "Base: Por definir", fotoUrl: "" },
      ]);
    });

    it("sin color: lista vacía", () => {
      const [row] = groupQuoteDisplayItems([quoteItem({ id: "l1" })]);
      expect(row.colores).toEqual([]);
    });
  });
});
