import { describe, expect, it } from "vitest";
import { expandQuoteItemToOrderItems } from "./order-items";
import { parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";

const partes = [
  { parte: "Tapizado", color: "Crema", colorCodigo: "C1", colorMaterial: "Cuero tex", colorFotoUrl: "", hex: "" },
  { parte: "Base", color: "Dorada", colorCodigo: "", colorMaterial: "", colorFotoUrl: "", hex: "" },
];
const notes = stringifyQuoteItemMeta({ partes, imagenColoresUrl: "https://x/colores.png" });
const base = { id: "q1", productId: "p1", quantity: 1, unitPrice: 100, lineTotal: 100, fulfillmentMode: "MANUFACTURE" as const, notes };

describe("color por parte de la cotización a la orden", () => {
  it("producto suelto: las notas pasan igual", () => {
    const [item] = expandQuoteItemToOrderItems({ ...base, product: { name: "Silla", isBundle: false, bundleComponents: [] } });
    expect(item.notes).toBe(notes);
  });

  it("combo partido en piezas: cada pieza lleva partes, imagen y el texto del color", () => {
    const items = expandQuoteItemToOrderItems({
      ...base,
      product: {
        name: "Combo",
        isBundle: true,
        bundleComponents: [
          { quantity: 1, child: { id: "a", name: "Silla", code: "S1", price: 60 } },
          { quantity: 1, child: { id: "b", name: "Base", code: "B1", price: 40 } },
        ],
      },
    });
    expect(items).toHaveLength(2);
    for (const item of items) {
      const meta = parseQuoteItemMeta(item.notes);
      expect(meta.partes).toEqual(partes);
      expect(meta.imagenColoresUrl).toBe("https://x/colores.png");
      expect(meta.color).toBe("Tapizado: Crema · Base: Dorada");
    }
  });
});
