import { describe, expect, it, vi } from "vitest";

import type { CrmQuoteRepository } from "../application/create-crm-quote";
import { handleCrmQuotePost } from "./crm-quote-http";

const KEY = "llave-de-prueba-suficientemente-larga-123";

const BODY = {
  client: {
    fullName: "Ana Pérez",
    document: "1144000000",
    phone: "3000000000",
    city: "Cali",
    department: "Valle",
    address: "Calle 10 # 20-30",
  },
  items: [{ productCode: "SIL-01", quantity: 2 }],
  asesoraEmail: "ingrid@magilus.com",
  linea: "Admin",
  crmConversationId: "conv1",
};

function repository(overrides: Partial<CrmQuoteRepository> = {}): CrmQuoteRepository {
  return {
    findProducts: vi.fn(async () => [{ id: "p1", code: "SIL-01", name: "Silla", price: 500_000, isBundle: false, components: [] }]),
    findRecentByConversation: vi.fn(async () => []),
    findStaffByEmail: vi.fn(async (email: string) =>
      email === "ingrid@magilus.com" ? { id: "u1", name: "Ingrid", email } : null,
    ),
    findFirstAdmin: vi.fn(async () => ({ id: "admin", name: "Admin", email: "admin@magilus.com" })),
    upsertClient: vi.fn(async () => "client1"),
    hasPreviousSales: vi.fn(async () => true),
    createQuote: vi.fn(async () => ({ id: "q1", code: "COT-00200", shareToken: "tok" })),
    logCreated: vi.fn(async () => undefined),
    ...overrides,
  };
}

function deps(repo: CrmQuoteRepository) {
  return {
    expectedKeys: [KEY],
    repository: repo,
    shareUrl: (token: string) => `https://magilus.com/cotizaciones/${token}`,
    pdfUrl: (token: string) => `https://magilus.com/api/generate-quote-pdf?token=${token}`,
    systemUserEmail: null,
    now: () => new Date("2026-10-18T15:00:00Z"),
    newComboKey: () => "k",
  };
}

function post(body: unknown, key: string | null = KEY): Request {
  return new Request("http://localhost/api/cotizaciones", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cotizaciones", () => {
  it("401 sin llave", async () => {
    const repo = repository();
    const response = await handleCrmQuotePost(post(BODY, null), deps(repo));
    expect(response.status).toBe(401);
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it("422 con lo que falta y no crea nada", async () => {
    const repo = repository();
    const response = await handleCrmQuotePost(post({ ...BODY, client: { ...BODY.client, document: "" } }), deps(repo));
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json).toEqual({ ok: false, missing: [{ campo: "document", mensaje: "Falta la cédula o NIT del cliente" }] });
    expect(repo.upsertClient).not.toHaveBeenCalled();
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it("422 si el producto no existe en Gestion", async () => {
    const repo = repository({ findProducts: vi.fn(async () => []) });
    const response = await handleCrmQuotePost(post(BODY), deps(repo));
    expect(response.status).toBe(422);
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it("201 crea con precio de Gestion, asesora como creadora y origen resuelto", async () => {
    const repo = repository();
    const response = await handleCrmQuotePost(post(BODY), deps(repo));
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      reused: false,
      quoteId: "q1",
      code: "COT-00200",
      total: 1_000_000,
      shareUrl: "https://magilus.com/cotizaciones/tok",
      createdBy: { email: "ingrid@magilus.com", fallback: false },
      missing: [],
    });
    expect(repo.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client1",
        createdById: "u1",
        origin: "RECURRENTE",
        total: 1_000_000,
        originDetail: { via: "cotizacion", crmItemsKey: "p1:2", linea: "Admin", crmConversationId: "conv1" },
      }),
    );
  });

  it("asesora sin usuario en Gestion -> primer ADMIN (fallback)", async () => {
    const repo = repository();
    const response = await handleCrmQuotePost(post({ ...BODY, asesoraEmail: "nueva@x.com" }), deps(repo));
    const json = await response.json();
    expect(json.createdBy).toEqual({ email: "admin@magilus.com", fallback: true });
  });

  it("200 reutiliza la del mismo chat con los mismos productos", async () => {
    const repo = repository({
      findRecentByConversation: vi.fn(async () => [
        { id: "q0", code: "COT-00199", total: 1_000_000, shareToken: "old", itemsKey: "p1:2" },
      ]),
    });
    const response = await handleCrmQuotePost(post(BODY), deps(repo));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, reused: true, code: "COT-00199", shareUrl: "https://magilus.com/cotizaciones/old" });
    expect(repo.findRecentByConversation).toHaveBeenCalledWith("conv1", new Date("2026-10-18T14:50:00Z"));
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it("productos distintos en el mismo chat -> crea otra", async () => {
    const repo = repository({
      findRecentByConversation: vi.fn(async () => [
        { id: "q0", code: "COT-00199", total: 500_000, shareToken: "old", itemsKey: "p1:1" },
      ]),
    });
    const response = await handleCrmQuotePost(post(BODY), deps(repo));
    expect(response.status).toBe(201);
  });
});
