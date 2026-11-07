import { describe, expect, it } from "vitest";
import { buildFabricationCopyText, type FabricationCopyInput } from "./order-fabrication-info";
import { stringifyQuoteItemMeta } from "./quote-item-meta";

type Item = FabricationCopyInput["items"][number];

function item(overrides: Partial<Omit<Item, "product">> & { product?: Partial<Item["product"]> } = {}): Item {
  const { product, ...rest } = overrides;
  return {
    id: "i1",
    confirmedSupplierId: "laura",
    quantity: 1,
    notes: null,
    ...rest,
    product: { name: "Silla barbera", code: "SIL001", thumbnailUrl: "", description: null, ...product },
  };
}

function input(overrides: Partial<FabricationCopyInput> = {}): FabricationCopyInput {
  return {
    orderCode: "ORD-00102",
    saleCode: "SAL-00093",
    ofCode: "OF-00049",
    supplierId: "laura",
    supplierName: "Laura",
    estimatedDeliveryAt: new Date("2026-11-20T17:00:00Z"),
    ofNotes: null,
    items: [],
    ...overrides,
  };
}

// Partes guardadas a mano para que además traiga un `color` distinto.
const notasConPartes = JSON.stringify({
  _type: "quote-item-meta",
  color: "Negro viejo",
  description: "Con apoyacabezas",
  imagenColoresUrl: "https://magilus.com/uploads/vista-color/abc.webp",
  partes: [
    { parte: "Tapizado", color: "Crema" },
    { parte: "Base", color: "Dorada" },
  ],
});

describe("buildFabricationCopyText", () => {
  it("OF con un producto: texto completo", () => {
    const text = buildFabricationCopyText(
      input({ ofNotes: "Empacar con cartón doble", items: [item({ notes: notasConPartes })] }),
    );
    expect(text).toBe(
      [
        "Referencia: ORD-102 / SAL-93 / OF-49",
        "Proveedora: Laura",
        "Fecha de entrega: 20-nov-2026",
        "1 x SILLA BARBERA (SIL001)",
        "  Color: Tapizado: Crema · Base: Dorada",
        "  Detalle: Con apoyacabezas",
        "  Imagen: https://magilus.com/uploads/vista-color/abc.webp",
        "Notas de la orden: Empacar con cartón doble",
      ].join("\n"),
    );
  });

  it("varios productos: orden estable por nombre, código e id", () => {
    const items = [
      item({ id: "c", product: { name: "Tocador", code: "TOC1" } }),
      item({ id: "b", quantity: 2, product: { name: "Camilla", code: "CAM2" } }),
      item({ id: "a", product: { name: "Camilla", code: "CAM2" } }),
      item({ id: "d", product: { name: "Camilla", code: "CAM1" } }),
    ];
    const text = buildFabricationCopyText(input({ items }));
    expect(buildFabricationCopyText(input({ items: [...items].reverse() }))).toBe(text);
    const productos = text.split("\n").filter((line) => / x /.test(line));
    expect(productos).toEqual(["1 x CAMILLA (CAM1)", "1 x CAMILLA (CAM2)", "2 x CAMILLA (CAM2)", "1 x TOCADOR (TOC1)"]);
  });

  it("sin fecha estimada: Sin fecha; sin venta, se omite SAL", () => {
    const text = buildFabricationCopyText(input({ saleCode: null, estimatedDeliveryAt: null, items: [item()] }));
    expect(text).toContain("Fecha de entrega: Sin fecha");
    expect(text).toContain("Referencia: ORD-102 / OF-49\n");
  });

  it("sin color, sin código y sin proveedora: Sin dato", () => {
    const text = buildFabricationCopyText(input({ supplierName: null, items: [item({ product: { code: null } })] }));
    expect(text).toContain("Proveedora: Sin dato");
    expect(text).toContain("1 x SILLA BARBERA (Sin dato)");
    expect(text).toContain("  Color: Sin dato");
  });

  it("sin imagen, detalle ni notas: no salen esas líneas ni líneas vacías", () => {
    const text = buildFabricationCopyText(input({ ofNotes: "  ", items: [item({ product: { description: " \n " } })] }));
    expect(text).toBe(
      [
        "Referencia: ORD-102 / SAL-93 / OF-49",
        "Proveedora: Laura",
        "Fecha de entrega: 20-nov-2026",
        "1 x SILLA BARBERA (SIL001)",
        "  Color: Sin dato",
      ].join("\n"),
    );
    expect(text).not.toContain("Imagen:");
    expect(text).not.toContain("http");
  });

  it("detalle y notas con saltos de línea quedan en una sola línea", () => {
    const text = buildFabricationCopyText(
      input({
        ofNotes: "Empacar\n\nbien",
        items: [item({ product: { description: "Medidas:\n\n 60 x 40\r\n" } })],
      }),
    );
    expect(text).toContain("  Detalle: Medidas: 60 x 40");
    expect(text).toContain("Notas de la orden: Empacar bien");
    expect(text.split("\n").every((line) => line.trim() !== "")).toBe(true);
  });

  it("usa meta.color si no hay partes, y la imagen del catálogo si no hay otra", () => {
    const notes = stringifyQuoteItemMeta({ color: "Rojo" });
    const text = buildFabricationCopyText(
      input({ items: [item({ notes, product: { thumbnailUrl: "https://magilus.com/uploads/silla.webp" } })] }),
    );
    expect(text).toContain("  Color: Rojo");
    expect(text).toContain("  Imagen: https://magilus.com/uploads/silla.webp");
  });

  it("línea con partes: sale el texto de las partes, no meta.color", () => {
    const text = buildFabricationCopyText(input({ items: [item({ notes: notasConPartes })] }));
    expect(text).toContain("  Color: Tapizado: Crema · Base: Dorada");
    expect(text).not.toContain("Negro viejo");
  });

  it("dos proveedoras: cada una ve solo lo suyo; sin productos devuelve vacío", () => {
    const items = [
      item({ id: "1", confirmedSupplierId: "laura", product: { name: "Silla", code: "S1" } }),
      item({ id: "2", confirmedSupplierId: "marta", product: { name: "Camilla", code: "C1" } }),
      item({ id: "3", confirmedSupplierId: null, product: { name: "Butaco", code: "B1" } }),
    ];
    const laura = buildFabricationCopyText(input({ items }));
    expect(laura).toContain("SILLA (S1)");
    expect(laura).not.toContain("CAMILLA");
    expect(laura).not.toContain("BUTACO");
    const marta = buildFabricationCopyText(input({ supplierId: "marta", supplierName: "Marta", items }));
    expect(marta).toContain("CAMILLA (C1)");
    expect(marta).not.toContain("SILLA");
    expect(buildFabricationCopyText(input({ supplierId: "otra", items }))).toBe("");
  });

  it("no copia costos, descuentos ni adicionales aunque vengan en la entrada", () => {
    const notes = stringifyQuoteItemMeta({ color: "Negro", discount: 123456, additionalCost: 987654 });
    const conCosto = { ...item({ notes }), purchaseCost: 580000, unitPrice: 777777 };
    const text = buildFabricationCopyText(input({ items: [conCosto] }));
    for (const valor of ["123456", "987654", "580000", "777777", "123.456", "580.000"]) {
      expect(text).not.toContain(valor);
    }
    expect(text).toContain("  Color: Negro");
  });
});
