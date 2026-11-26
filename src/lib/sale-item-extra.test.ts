import { describe, expect, it } from "vitest";
import { calculateQuoteLineTotal, parseQuoteItemMeta, stringifyQuoteItemMeta } from "./quote-item-meta";
import { mismasLineas } from "./quote-lines";
import { adicionalesDeLinea, aplicarAdicional, bloqueoAdicional, lineasDelAdicional, validarAdicional } from "./sale-item-extra";

const adicional = { descripcion: "Base cromada", precio: 50_000, costo: 0, porId: "u1", porNombre: "Ana", en: "2026-11-26T15:00:00.000Z" };

describe("validarAdicional", () => {
  it("acepta descripción de 2 a 80 letras, precio > 0 y costo opcional", () => {
    expect(validarAdicional({ descripcion: "  Base cromada ", precio: "50000" })).toEqual({
      ok: true,
      value: { descripcion: "Base cromada", precio: 50_000, costo: 0 },
    });
    expect(validarAdicional({ descripcion: "ab", precio: 1, costo: "30000" })).toMatchObject({ ok: true, value: { costo: 30_000 } });
  });
  it("rechaza descripción corta o larga, precio fuera de rango y costo negativo", () => {
    expect(validarAdicional({ descripcion: " a ", precio: 1 }).ok).toBe(false);
    expect(validarAdicional({ descripcion: "x".repeat(81), precio: 1 }).ok).toBe(false);
    expect(validarAdicional({ descripcion: "Base", precio: 0 }).ok).toBe(false);
    expect(validarAdicional({ descripcion: "Base", precio: "abc" }).ok).toBe(false);
    expect(validarAdicional({ descripcion: "Base", precio: 20_000_001 }).ok).toBe(false);
    expect(validarAdicional({ descripcion: "Base", precio: 20_000_000 }).ok).toBe(true);
    expect(validarAdicional({ descripcion: "Base", precio: 1, costo: -1 }).ok).toBe(false);
  });
});

describe("bloqueoAdicional", () => {
  const base = { saleStatus: "ACTIVE", itemCancelado: false, costo: 0, fulfillmentMode: "STOCK", confirmedSupplierId: null };
  it("deja pasar una venta activa o pagada sin costo", () => {
    expect(bloqueoAdicional(base)).toBeNull();
    expect(bloqueoAdicional({ ...base, saleStatus: "INVOICED" })).toBeNull();
  });
  it("rechaza venta cancelada, línea cancelada o sin venta", () => {
    expect(bloqueoAdicional({ ...base, saleStatus: "CANCELLED" })).toMatch(/cancelada/);
    expect(bloqueoAdicional({ ...base, itemCancelado: true })).toMatch(/cancelado/);
    expect(bloqueoAdicional({ ...base, saleStatus: null })).not.toBeNull();
  });
  it("costo > 0 solo en fabricación con proveedora confirmada", () => {
    expect(bloqueoAdicional({ ...base, costo: 30_000 })).toMatch(/fabricación/);
    expect(bloqueoAdicional({ ...base, costo: 30_000, fulfillmentMode: "MANUFACTURE" })).toMatch(/proveedora/);
    expect(bloqueoAdicional({ ...base, costo: 30_000, fulfillmentMode: "MANUFACTURE", confirmedSupplierId: "s1" })).toBeNull();
  });
});

describe("aplicarAdicional", () => {
  it("el total de la línea sube exactamente el precio y queda en la lista", () => {
    const meta = parseQuoteItemMeta(stringifyQuoteItemMeta({ color: "Negro", additionalCost: 10_000, discount: 5_000 }));
    const antes = calculateQuoteLineTotal(1, 1_129_000, meta.additionalCost, meta.discount);
    const nuevo = aplicarAdicional(meta, adicional);
    expect(calculateQuoteLineTotal(1, 1_129_000, nuevo.additionalCost, nuevo.discount) - antes).toBe(50_000);
    expect(nuevo.color).toBe("Negro");
    expect(adicionalesDeLinea(stringifyQuoteItemMeta(nuevo))).toEqual([adicional]);
    // Un segundo adicional se suma al primero.
    const dos = aplicarAdicional(nuevo, { ...adicional, descripcion: "Ruedas", precio: 20_000 });
    expect(dos.additionalCost).toBe(80_000);
    expect(dos.adicionales.map((a) => a.descripcion)).toEqual(["Base cromada", "Ruedas"]);
  });
  it("una nota sin adicionales queda con el mismo texto; mal formados se leen como []", () => {
    const nota = stringifyQuoteItemMeta({ color: "Negro" });
    expect(stringifyQuoteItemMeta(parseQuoteItemMeta(nota))).toBe(nota);
    expect(nota).not.toContain("adicionales");
    expect(stringifyQuoteItemMeta({})).toBeNull();
    expect(adicionalesDeLinea(JSON.stringify({ _type: "quote-item-meta", adicionales: "x" }))).toEqual([]);
    expect(adicionalesDeLinea(JSON.stringify({ _type: "quote-item-meta", adicionales: [{ precio: 5 }, null] }))).toEqual([]);
    expect(adicionalesDeLinea(null)).toEqual([]);
  });
  it("el editor (que no manda la lista) sigue viendo la línea igual", () => {
    const linea = { productId: "p", supplierId: null, quantity: 1, unitPrice: 1_129_000, fulfillmentMode: "STOCK" };
    const conAdicional = stringifyQuoteItemMeta(aplicarAdicional(parseQuoteItemMeta(null), adicional));
    const delEditor = stringifyQuoteItemMeta({ additionalCost: 50_000 });
    expect(mismasLineas([{ ...linea, notes: conAdicional }], [{ ...linea, notes: delEditor }])).toBe(true);
    expect(mismasLineas([{ ...linea, notes: conAdicional }], [{ ...linea, notes: stringifyQuoteItemMeta({}) }])).toBe(false);
  });
});

describe("lineasDelAdicional", () => {
  const combo = JSON.stringify({ _type: "quote-item-meta", comboKey: "k", comboName: "Combo" });
  const quoteItems = [
    { id: "q1", notes: combo, productName: "Camilla", isBundle: false },
    { id: "q2", notes: combo, productName: "Butaco", isBundle: false },
    { id: "q3", notes: null, productName: "Silla", isBundle: false },
  ];
  const orderItems = [
    { id: "o1", quoteItemId: "q1", notes: combo },
    { id: "o2", quoteItemId: "q2", notes: combo },
    { id: "o3", quoteItemId: "q3", notes: null },
  ];
  it("en un combo toma la primera pieza aunque se elija otra", () => {
    expect(lineasDelAdicional("o2", quoteItems, orderItems)).toEqual({ quoteItem: quoteItems[0], orderItem: orderItems[0] });
  });
  it("un producto suelto es su propia línea; uno que no está en la orden da null", () => {
    expect(lineasDelAdicional("o3", quoteItems, orderItems)).toEqual({ quoteItem: quoteItems[2], orderItem: orderItems[2] });
    expect(lineasDelAdicional("nada", quoteItems, orderItems)).toBeNull();
  });
  it("combo sin desglosar: la línea del combo y su primera pieza en la orden", () => {
    const q = [{ id: "qc", notes: null, productName: "Combo", isBundle: true }];
    const piezas = (n: string) => JSON.stringify({ _type: "quote-item-meta", description: "Combo: Combo", n });
    const o = [
      { id: "p1", quoteItemId: null, notes: piezas("1") },
      { id: "p2", quoteItemId: null, notes: piezas("2") },
    ];
    expect(lineasDelAdicional("p2", q, o)).toEqual({ quoteItem: q[0], orderItem: o[0] });
  });
});
