import { describe, expect, it } from "vitest";

import {
  buildItemsKey,
  buildQuoteLines,
  matchProducts,
  originFromLinea,
  parseCrmQuoteRequest,
  type ProductForQuote,
} from "./crm-quote-request";

const CLIENT = {
  fullName: "Ana Pérez",
  document: "1144000000",
  email: "",
  phone: "+57 300 000 0000",
  city: "Cali",
  department: "Valle del Cauca",
  address: "Calle 10 # 20-30",
};

const SILLA: ProductForQuote = { id: "p1", code: "SIL-01", name: "Silla", price: 500_000, isBundle: false, components: [] };
const COMBO: ProductForQuote = {
  id: "c1",
  code: "COMBO-1",
  name: "Combo",
  price: 900_000,
  isBundle: true,
  components: [
    { productId: "p1", name: "Silla", code: "SIL-01", quantity: 1, retailPrice: 500_000 },
    { productId: "p2", name: "Espejo", code: "ESP-01", quantity: 1, retailPrice: 500_000 },
  ],
};

describe("parseCrmQuoteRequest", () => {
  it("acepta un pedido completo y mapea la linea al origen", () => {
    const result = parseCrmQuoteRequest({
      client: CLIENT,
      items: [{ productCode: "sil-01", quantity: "2" }],
      linea: "Ventas 1",
      asesoraEmail: " Ingrid@Magilus.com ",
      crmConversationId: "conv1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.origin).toBe("META_ADS");
    expect(result.request.items).toEqual([{ productCode: "sil-01", productId: null, quantity: 2 }]);
    expect(result.request.client.email).toBeNull();
    expect(result.request.asesoraEmail).toBe("ingrid@magilus.com");
  });

  it("lista todo lo que falta de una vez", () => {
    const result = parseCrmQuoteRequest({ client: { fullName: "A", email: "malo" }, items: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing.map((item) => item.campo)).toEqual([
      "fullName",
      "document",
      "email",
      "phone",
      "city",
      "department",
      "address",
      "items",
    ]);
  });

  it("pide codigo y cantidad valida por producto", () => {
    const result = parseCrmQuoteRequest({ client: CLIENT, items: [{ quantity: 1 }, { productCode: "X", quantity: 0 }] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing.map((item) => item.campo)).toEqual(["items[0].producto", "items[1].quantity"]);
  });

  it("body invalido", () => {
    expect(parseCrmQuoteRequest("hola").ok).toBe(false);
  });

  it("el origen explicito gana sobre la linea", () => {
    const result = parseCrmQuoteRequest({ client: CLIENT, items: [{ productId: "p1", quantity: 1 }], origin: "marketplace", linea: "Ventas 1" });
    expect(result.ok && result.request.origin).toBe("MARKETPLACE");
  });
});

describe("originFromLinea", () => {
  it("mapea las tres lineas", () => {
    expect(originFromLinea("Ventas 1")).toBe("META_ADS");
    expect(originFromLinea("VENTAS-2")).toBe("MARKETPLACE");
    expect(originFromLinea("Admin")).toBe("REFERIDO_RECURRENTE");
    expect(originFromLinea("Otra")).toBeNull();
    expect(originFromLinea(null)).toBeNull();
  });
});

describe("matchProducts", () => {
  it("cruza por codigo sin mayusculas y por id", () => {
    const result = matchProducts(
      [
        { productCode: "sil-01", productId: null, quantity: 2 },
        { productCode: null, productId: "c1", quantity: 1 },
      ],
      [SILLA, COMBO],
    );
    expect(result.ok).toBe(true);
  });

  it("producto inexistente, sin precio o combo vacio -> missing", () => {
    const result = matchProducts(
      [
        { productCode: "NO", productId: null, quantity: 1 },
        { productCode: "GRATIS", productId: null, quantity: 1 },
        { productCode: "VACIO", productId: null, quantity: 1 },
      ],
      [
        { ...SILLA, id: "g", code: "GRATIS", price: 0 },
        { ...COMBO, id: "v", code: "VACIO", components: [] },
      ],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toHaveLength(3);
    expect(result.missing[0].mensaje).toContain("no existe en Gestión");
  });
});

describe("buildQuoteLines", () => {
  it("usa el precio de Gestion y expande combos", () => {
    const { lines, subtotal, total } = buildQuoteLines(
      [
        { product: SILLA, quantity: 2 },
        { product: COMBO, quantity: 1 },
      ],
      () => "k1",
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ productId: "p1", quantity: 2, unitPrice: 500_000, lineTotal: 1_000_000, notes: null });
    expect(lines[1].unitPrice + lines[2].unitPrice).toBe(900_000);
    expect(JSON.parse(lines[1].notes!)).toMatchObject({ comboKey: "k1", comboName: "Combo", comboCode: "COMBO-1", comboQuantity: 1 });
    expect(subtotal).toBe(1_900_000);
    expect(total).toBe(subtotal);
  });
});

describe("buildItemsKey", () => {
  it("no depende del orden y suma repetidos", () => {
    const a = buildItemsKey([
      { product: { id: "b" }, quantity: 1 },
      { product: { id: "a" }, quantity: 2 },
      { product: { id: "b" }, quantity: 1 },
    ]);
    expect(a).toBe("a:2|b:2");
    expect(buildItemsKey([{ product: { id: "a" }, quantity: 3 }])).not.toBe(a);
  });
});
