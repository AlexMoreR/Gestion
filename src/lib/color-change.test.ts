import { describe, expect, it } from "vitest";
import {
  linesToRecolor,
  mismoColor,
  notesWithNewColor,
  parseColorChangeReason,
  parseNuevoColor,
  type LineaCotizacion,
  type LineaOrden,
} from "./color-change";
import { parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";

const palo = { color: "Palo de rosa", colorCodigo: "PR-02", colorMaterial: "Sintético", colorFotoUrl: "https://crm.magilus.com/c/pr.jpg" };
const nota = (meta: Parameters<typeof stringifyQuoteItemMeta>[0]) => stringifyQuoteItemMeta(meta);

describe("notesWithNewColor", () => {
  it("cambia solo el color y deja igual descripción, descuento, costo adicional y combo", () => {
    const antes = nota({
      description: "Con base cromada",
      color: "Crema",
      additionalCost: 20000,
      discount: 5000,
      comboKey: "k1",
      comboName: "Combo barbería",
      comboCode: "CMB005",
      comboQuantity: 1,
    });
    const despues = parseQuoteItemMeta(notesWithNewColor(antes, palo));
    expect(despues).toEqual({ ...parseQuoteItemMeta(antes), ...palo });
  });

  it("una nota de texto viejo queda como descripción y gana el color", () => {
    const despues = parseQuoteItemMeta(notesWithNewColor("Entregar en la tarde", { ...palo, colorCodigo: "", colorMaterial: "", colorFotoUrl: "" }));
    expect(despues.description).toBe("Entregar en la tarde");
    expect(despues.color).toBe("Palo de rosa");
  });

  it("mismoColor detecta que no hay cambio", () => {
    expect(mismoColor(nota({ ...palo }), palo)).toBe(true);
    expect(mismoColor(nota({ color: "Crema" }), palo)).toBe(false);
  });
});

describe("parseColorChangeReason / parseNuevoColor", () => {
  it("rechaza un motivo vacío o de menos de 3 letras", () => {
    expect(parseColorChangeReason("").ok).toBe(false);
    expect(parseColorChangeReason("  ab ").ok).toBe(false);
    expect(parseColorChangeReason(null).ok).toBe(false);
    expect(parseColorChangeReason(" El cliente cambió ")).toEqual({ ok: true, value: "El cliente cambió" });
  });

  it("exige el nombre del color y descarta fotos que no son http(s)", () => {
    expect(parseNuevoColor({ color: " " }).ok).toBe(false);
    const r = parseNuevoColor({ ...palo, colorFotoUrl: "javascript:alert(1)" });
    expect(r).toEqual({ ok: true, value: { ...palo, colorFotoUrl: "" } });
    // A mano (sin código): sin material ni foto.
    expect(parseNuevoColor({ color: "Vino", colorMaterial: "X", colorFotoUrl: palo.colorFotoUrl })).toEqual({
      ok: true,
      value: { color: "Vino", colorCodigo: "", colorMaterial: "", colorFotoUrl: "" },
    });
  });
});

describe("linesToRecolor", () => {
  it("combo desglosado: cambia todas sus líneas de la cotización y de la orden", () => {
    const combo = { comboKey: "k1", comboName: "Combo", comboCode: "CMB005", comboQuantity: 1, color: "Crema" };
    const quote: LineaCotizacion[] = [
      { id: "q1", notes: nota(combo), productName: "Silla", isBundle: false },
      { id: "q2", notes: nota(combo), productName: "Lavacabezas", isBundle: false },
      { id: "q3", notes: nota({ color: "Negro" }), productName: "Butaco", isBundle: false },
    ];
    const order: LineaOrden[] = [
      { id: "o1", quoteItemId: "q1", notes: quote[0].notes },
      { id: "o2", quoteItemId: "q2", notes: quote[1].notes },
      { id: "o3", quoteItemId: "q3", notes: quote[2].notes },
    ];
    const r = linesToRecolor("o2", quote, order);
    expect(r?.quoteItemIds.sort()).toEqual(["q1", "q2"]);
    expect(r?.orderItemIds.sort()).toEqual(["o1", "o2"]);
  });

  it("combo sin desglosar: cambia la línea del combo y todas sus piezas de la orden", () => {
    const quote: LineaCotizacion[] = [
      { id: "q1", notes: nota({ color: "Crema" }), productName: "Combo CMB005", isBundle: true },
      { id: "q2", notes: nota({ color: "Negro" }), productName: "Butaco", isBundle: false },
    ];
    const pieza = nota({ description: "Combo: Combo CMB005", color: "Crema" });
    const piezaConDesc = nota({ description: "Base cromada - Combo: Combo CMB005", color: "Crema" });
    const order: LineaOrden[] = [
      { id: "o1", quoteItemId: null, notes: pieza },
      { id: "o2", quoteItemId: null, notes: piezaConDesc },
      { id: "o3", quoteItemId: "q2", notes: quote[1].notes },
    ];
    const r = linesToRecolor("o1", quote, order);
    expect(r).toEqual({ quoteItemIds: ["q1"], orderItemIds: ["o1", "o2"] });
  });

  it("dos combos iguales sin desglosar se separan por el color que tenían", () => {
    const quote: LineaCotizacion[] = [
      { id: "q1", notes: nota({ color: "Crema" }), productName: "Combo", isBundle: true },
      { id: "q2", notes: nota({ color: "Negro" }), productName: "Combo", isBundle: true },
    ];
    const order: LineaOrden[] = [
      { id: "o1", quoteItemId: null, notes: nota({ description: "Combo: Combo", color: "Crema" }) },
      { id: "o2", quoteItemId: null, notes: nota({ description: "Combo: Combo", color: "Negro" }) },
    ];
    expect(linesToRecolor("o2", quote, order)).toEqual({ quoteItemIds: ["q2"], orderItemIds: ["o2"] });
  });

  it("producto suelto: solo su línea; sin línea de cotización, solo la de la orden", () => {
    const quote: LineaCotizacion[] = [{ id: "q1", notes: nota({ color: "Crema" }), productName: "Silla", isBundle: false }];
    const order: LineaOrden[] = [
      { id: "o1", quoteItemId: "q1", notes: quote[0].notes },
      { id: "o2", quoteItemId: null, notes: null },
    ];
    expect(linesToRecolor("o1", quote, order)).toEqual({ quoteItemIds: ["q1"], orderItemIds: ["o1"] });
    expect(linesToRecolor("o2", quote, order)).toEqual({ quoteItemIds: [], orderItemIds: ["o2"] });
    expect(linesToRecolor("nada", quote, order)).toBeNull();
  });
});

describe("notesWithNewColor con partes", () => {
  it("Cambiar color deja el color nuevo como texto (las partes no lo pisan)", () => {
    const antes = nota({ partes: [{ parte: "Tapizado", color: "Crema", colorCodigo: "", colorMaterial: "", colorFotoUrl: "", hex: "" }] });
    const despues = parseQuoteItemMeta(notesWithNewColor(antes, palo));
    expect(despues.color).toBe("Palo de rosa");
    expect(despues.partes).toEqual([]);
  });
});
