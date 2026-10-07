import { describe, expect, it, vi } from "vitest";

import type { QuoteForOrigin, SaleOriginRepository } from "../application/register-sale-origin";
import { handleSaleOriginPost } from "./sale-origin-http";

const KEY = "llave-de-prueba-suficientemente-larga-123";
const OTHER_KEY = "otra-llave-de-transporte-bastante-larga-456";

const QUOTE: QuoteForOrigin = {
  id: "q1",
  code: "COT-00121",
  createdAt: new Date("2026-10-01T15:00:00Z"),
  client: { id: "c1", isGeneric: false },
  sale: null,
};

function repository(overrides: Partial<SaleOriginRepository> = {}): SaleOriginRepository {
  return {
    findQuoteByCodes: vi.fn(async (codes: string[]) => (codes.includes(QUOTE.code) ? QUOTE : null)),
    findClientIdsByPhone: vi.fn(async () => []),
    hasPreviousSales: vi.fn(async () => false),
    saveOrigin: vi.fn(async () => ({ saleUpdated: false })),
    ...overrides,
  };
}

function post(body: unknown, key: string | null = KEY): Request {
  return new Request("http://localhost/api/ventas/origen", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID = {
  quoteCode: "cot-121",
  origin: "META_ADS",
  originDetail: { adId: "A1", adTitle: "Combo negro", via: "cotizacion" },
  linea: "Ventas 1",
  contactPhone: "+57 300 123 4567",
};

describe("POST /api/ventas/origen", () => {
  it("401 sin llave, con llave incorrecta o sin llave configurada", async () => {
    const repo = repository();
    expect((await handleSaleOriginPost(post(VALID, null), { expectedKeys: [KEY], repository: repo })).status).toBe(401);
    expect((await handleSaleOriginPost(post(VALID, `${KEY}x`), { expectedKeys: [KEY], repository: repo })).status).toBe(401);
    expect((await handleSaleOriginPost(post(VALID), { expectedKeys: [undefined], repository: repo })).status).toBe(401);
    expect(repo.saveOrigin).not.toHaveBeenCalled();
  });

  it("acepta cualquiera de las llaves que ya usa el CRM (catalogo o transporte)", async () => {
    const response = await handleSaleOriginPost(post(VALID, OTHER_KEY), { expectedKeys: [KEY, OTHER_KEY], repository: repository() });
    expect(response.status).toBe(200);
  });

  it("200: guarda origen y detalle (con la linea, sin telefono) y devuelve el codigo canonico", async () => {
    const repo = repository({ saveOrigin: vi.fn(async () => ({ saleUpdated: true })) });
    const response = await handleSaleOriginPost(post(VALID), { expectedKeys: [KEY], repository: repo });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, quoteCode: "COT-00121", origin: "META_ADS", saleUpdated: true });
    expect(repo.findQuoteByCodes).toHaveBeenCalledWith(["COT-00121", "COT-121"]);
    expect(repo.saveOrigin).toHaveBeenCalledWith({
      quoteId: "q1",
      origin: "META_ADS",
      originDetail: { adId: "A1", adTitle: "Combo negro", via: "cotizacion", linea: "Ventas 1" },
    });
    expect(JSON.stringify(vi.mocked(repo.saveOrigin).mock.calls)).not.toContain("4567");
    expect(repo.hasPreviousSales).not.toHaveBeenCalled();
  });

  it("REFERIDO_RECURRENTE: RECURRENTE si el cliente tiene una venta previa (excluyendo la propia)", async () => {
    const quote: QuoteForOrigin = { ...QUOTE, sale: { id: "s9", createdAt: new Date("2026-10-02T12:00:00Z") } };
    const repo = repository({
      findQuoteByCodes: vi.fn(async () => quote),
      hasPreviousSales: vi.fn(async () => true),
    });
    const response = await handleSaleOriginPost(post({ ...VALID, origin: "REFERIDO_RECURRENTE" }), {
      expectedKeys: [KEY],
      repository: repo,
    });
    expect(await response.json()).toMatchObject({ origin: "RECURRENTE" });
    expect(repo.hasPreviousSales).toHaveBeenCalledWith({
      clientIds: ["c1"],
      before: quote.sale!.createdAt,
      excludeSaleId: "s9",
    });
    expect(repo.findClientIdsByPhone).not.toHaveBeenCalled();
  });

  it("REFERIDO_RECURRENTE sin ventas previas: REFERIDO (antes de la fecha de la cotizacion si no hay venta)", async () => {
    const repo = repository();
    const response = await handleSaleOriginPost(post({ ...VALID, origin: "REFERIDO_RECURRENTE" }), {
      expectedKeys: [KEY],
      repository: repo,
    });
    expect(await response.json()).toMatchObject({ origin: "REFERIDO" });
    expect(repo.hasPreviousSales).toHaveBeenCalledWith({ clientIds: ["c1"], before: QUOTE.createdAt, excludeSaleId: null });
  });

  it("cliente generico (Consumidor final): decide la recurrencia por el telefono del chat", async () => {
    const repo = repository({
      findQuoteByCodes: vi.fn(async () => ({ ...QUOTE, client: { id: "cf", isGeneric: true } })),
      findClientIdsByPhone: vi.fn(async () => ["c7"]),
      hasPreviousSales: vi.fn(async () => true),
    });
    const response = await handleSaleOriginPost(post({ ...VALID, origin: "REFERIDO_RECURRENTE" }), {
      expectedKeys: [KEY],
      repository: repo,
    });
    expect(await response.json()).toMatchObject({ origin: "RECURRENTE" });
    expect(repo.findClientIdsByPhone).toHaveBeenCalledWith("3001234567");
    expect(repo.hasPreviousSales).toHaveBeenCalledWith(expect.objectContaining({ clientIds: ["c7"] }));
  });

  it("404 si la cotizacion no existe", async () => {
    const repo = repository();
    const response = await handleSaleOriginPost(post({ ...VALID, quoteCode: "COT-99999" }), { expectedKeys: [KEY], repository: repo });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "cotizacion_no_existe" });
    expect(repo.saveOrigin).not.toHaveBeenCalled();
  });

  it("400 si el body no es JSON o no cumple el contrato", async () => {
    const deps = { expectedKeys: [KEY], repository: repository() };
    const notJson = await handleSaleOriginPost(post("{no es json"), deps);
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ error: "datos_invalidos" });
    const badOrigin = await handleSaleOriginPost(post({ ...VALID, origin: "TIKTOK" }), deps);
    expect(badOrigin.status).toBe(400);
    expect(await badOrigin.json()).toEqual({ error: "datos_invalidos" });
  });

  it("500 si falla la base, sin filtrar el error", async () => {
    const repo = repository({ saveOrigin: vi.fn(async () => Promise.reject(new Error("db caida"))) });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleSaleOriginPost(post(VALID), { expectedKeys: [KEY], repository: repo });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "error_interno" });
    errorSpy.mockRestore();
  });
});
