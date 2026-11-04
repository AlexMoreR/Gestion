import { describe, expect, it } from "vitest";
import {
  duenioDePartes,
  fechaAviso,
  lineaFuente,
  partesConCambio,
  linesToRecolor,
  mensajeCambioColorOF,
  ofsConCambioDeColor,
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

  const parte = (p: string, color: string) => ({ parte: p, color, colorCodigo: "", colorMaterial: "", colorFotoUrl: "", hex: "" });
  const conPartes = nota({
    description: "Combo: CMB005",
    partes: [parte("Tapizado", "Crema"), parte("Base", "Cromada")],
    imagenColoresUrl: "/uploads/vista-color/vieja.webp",
  });

  it("cambia solo la parte con el mismo nombre, conserva las demás y guarda la imagen nueva", () => {
    const nuevo = parseNuevoColor({ partes: JSON.stringify([parte("base", "Dorada")]) });
    expect(nuevo.ok).toBe(true);
    if (!nuevo.ok) return;
    const despues = parseQuoteItemMeta(notesWithNewColor(conPartes, nuevo.value, "/uploads/vista-color/nueva.webp"));
    expect(despues.partes.map((p) => `${p.parte}:${p.color}`)).toEqual(["Tapizado:Crema", "Base:Dorada"]);
    expect(despues.color).toBe("Tapizado: Crema · Base: Dorada");
    expect(despues.description).toBe("Combo: CMB005");
    expect(despues.imagenColoresUrl).toBe("/uploads/vista-color/nueva.webp");
  });

  it("un color de texto borra la imagen con colores vieja", () => {
    expect(parseQuoteItemMeta(notesWithNewColor(conPartes, palo)).imagenColoresUrl).toBe("");
  });

  it("mismoColor con partes: igual si las partes elegidas no cambian", () => {
    expect(mismoColor(conPartes, { ...palo, partes: [parte("Base", "Cromada")] })).toBe(true);
    expect(mismoColor(conPartes, { ...palo, partes: [parte("Base", "Dorada")] })).toBe(false);
  });

  it("una línea sin partes toma las nuevas", () => {
    expect(partesConCambio(nota({ color: "Negro" }), { ...palo, partes: [parte("Base", "Dorada")] })).toEqual([parte("Base", "Dorada")]);
  });

  it("parseNuevoColor rechaza una parte en Por definir o sin color, y hex que no es #RRGGBB", () => {
    expect(parseNuevoColor({ partes: JSON.stringify([parte("Base", "Por definir")]) }).ok).toBe(false);
    expect(parseNuevoColor({ partes: JSON.stringify([parte("Base", "")]) }).ok).toBe(false);
    expect(parseNuevoColor({ partes: "no es json" }).ok).toBe(false);
    const r = parseNuevoColor({ partes: JSON.stringify([{ ...parte("Base", "Dorada"), hex: "red" }]) });
    expect(r.ok && r.value.partes?.[0].hex).toBe("");
  });
});

describe("lineaFuente / duenioDePartes", () => {
  const quote: (LineaCotizacion & { productId: string })[] = [
    { id: "q1", productId: "cmb", notes: nota({ color: "Crema" }), productName: "Combo camillas", isBundle: true },
  ];
  const pieza = { id: "o1", quoteItemId: null, productId: "camilla", notes: nota({ description: "Combo: Combo camillas", color: "Crema" }) };

  it("pieza de un combo sin desglosar: el dueño es el combo", () => {
    const fuente = lineaFuente(pieza, quote);
    expect(fuente?.id).toBe("q1");
    expect(duenioDePartes(pieza, fuente, new Map())).toBe("cmb");
  });

  it("combo desglosado: el dueño sale del código del combo; sin nada, el propio producto", () => {
    const desglosada = { productId: "camilla", notes: nota({ comboKey: "k", comboCode: "CMB005" }) };
    expect(duenioDePartes(desglosada, undefined, new Map([["CMB005", "cmb"]]))).toBe("cmb");
    expect(duenioDePartes({ productId: "silla", notes: null }, undefined, new Map())).toBe("silla");
  });
});

describe("ofsConCambioDeColor", () => {
  const ofs = [
    { id: "of-laura", supplierId: "laura" },
    { id: "of-ana", supplierId: "ana" },
  ];
  it("avisa solo a la OF de la proveedora con la línea asignada que no sale de stock", () => {
    expect(ofsConCambioDeColor([{ confirmedSupplierId: "laura", fulfillmentMode: "MANUFACTURE" }], ofs)).toEqual(["of-laura"]);
  });
  it("un combo con piezas de dos proveedoras avisa a las dos OF", () => {
    const lineas = [
      { confirmedSupplierId: "laura", fulfillmentMode: "MANUFACTURE" },
      { confirmedSupplierId: "ana", fulfillmentMode: "MIXED" },
      { confirmedSupplierId: "laura", fulfillmentMode: "MANUFACTURE" },
    ];
    expect(ofsConCambioDeColor(lineas, ofs)).toEqual(["of-laura", "of-ana"]);
  });
  it("sin proveedora o desde stock no deja aviso", () => {
    const lineas = [
      { confirmedSupplierId: null, fulfillmentMode: "MANUFACTURE" },
      { confirmedSupplierId: "ana", fulfillmentMode: "STOCK" },
    ];
    expect(ofsConCambioDeColor(lineas, ofs)).toEqual([]);
  });
});

describe("mensajeCambioColorOF", () => {
  it("arma el texto exacto con el código sin ceros y el enlace", () => {
    expect(
      mensajeCambioColorOF({
        code: "OF-00043",
        producto: "Combo Camillas",
        colorViejo: "Crema",
        colorNuevo: "Palo rosa",
        url: "https://magilus.com/of/OF-00043",
      }),
    ).toBe("Cambio de color en OF-43: Combo Camillas pasa de Crema a Palo rosa\nhttps://magilus.com/of/OF-00043");
  });
});

describe("fechaAviso", () => {
  it("usa el día de Colombia (las 3 a. m. UTC todavía son el día anterior)", () => {
    expect(fechaAviso(new Date("2026-11-05T03:00:00.000Z"))).toBe("04/11/2026");
  });
});
