import { describe, expect, it } from "vitest";

import type { ProductForQuote } from "../domain/crm-quote-request";
import { type ChatQuoteDeps, type ChatQuoteInput, confirmChatQuote, prepareChatQuote } from "./create-quote-by-chat";

const PRODUCTS: ProductForQuote[] = [
  { id: "psv", code: "PSV016", name: "Poltrona spa", price: 1_450_000, isBundle: false, components: [] },
  { id: "sil", code: "SIL-01", name: "Silla", price: 500_000, isBundle: false, components: [] },
];

// Repositorio falso: solo clientes, productos, equipo y cotizaciones.
function fakeDeps(now = new Date("2026-11-27T15:00:00Z")) {
  const state = {
    clock: now,
    clients: [] as { id: string; document: string }[],
    quotes: [] as { id: string; code: string; clientId: string; total: number; shareToken: string; createdAt: Date; originDetail: Record<string, string>; createdById: string; notes: string | null; origin: unknown }[],
    logs: [] as string[],
    created: 0,
  };
  const deps: ChatQuoteDeps = {
    repository: {
      findProducts: async ({ codes }) => PRODUCTS.filter((p) => codes.some((c) => c.toUpperCase() === p.code)),
      findClient: async (client) => state.clients.find((c) => c.document === client.document) ?? null,
      upsertClient: async (client) => {
        const found = state.clients.find((c) => c.document === client.document);
        if (found) return found.id;
        const id = `cli${state.clients.length + 1}`;
        state.clients.push({ id, document: client.document });
        return id;
      },
      listStaff: async () => [
        { id: "u1", name: "Ingrid Gómez", email: "ingrid@magilus.com" },
        { id: "u2", name: "María Camila", email: "camila@magilus.com" },
        { id: "u3", name: "María José", email: "jose@magilus.com" },
      ],
      findRecentChatQuotes: async (clientId, since) =>
        state.quotes
          .filter((q) => q.clientId === clientId && q.createdAt >= since && q.originDetail.canal === "MCP")
          .map((q) => ({ ...q, itemsKey: q.originDetail.itemsKey ?? null })),
      createQuote: async (input) => {
        state.created += 1;
        const quote = {
          id: `q${state.created}`,
          code: `COT-0020${state.created}`,
          shareToken: `tok${state.created}`,
          clientId: input.clientId,
          total: input.total,
          createdAt: state.clock,
          originDetail: input.originDetail,
          createdById: input.createdById,
          notes: input.notes,
          origin: input.origin,
        };
        state.quotes.push(quote);
        return quote;
      },
      logCreated: async (actor, quote, via) => {
        state.logs.push(`${actor.name}|${via}|${quote.code}`);
      },
    },
    shareUrl: (token) => `https://magilus.com/cotizaciones/${token}`,
    pdfUrl: (token) => `https://magilus.com/api/generate-quote-pdf?token=${token}`,
    now: () => state.clock,
    newComboKey: () => "k",
  };
  return { deps, state };
}

const ALDEAS: ChatQuoteInput = {
  cliente: {
    nombre: "Aldeas Infantiles",
    documento: "900123456",
    direccion: "Carrera 4 # 25-10",
    telefono: "3001234567",
    ciudad: "Quibdó",
    departamento: "Chocó",
  },
  ciudadEntrega: "Quibdó",
  productos: [{ codigo: "PSV016", cantidad: 1, color: "palo rosa", precio: 1_369_000 }],
  adicionales: [{ descripcion: "Envío Cali–Quibdó", valor: 350_000 }],
  observaciones: "Entregar en la sede",
  asesora: "ingrid gomez",
};

describe("prepareChatQuote", () => {
  it("caso Aldeas: da 1.719.000, trae el aviso del precio menor y no crea nada", async () => {
    const { deps, state } = fakeDeps();
    const result = await prepareChatQuote(deps, ALDEAS);
    expect(result).toMatchObject({
      ok: true,
      total: 1_719_000,
      asesora: "Ingrid Gómez",
      ciudadEntrega: "Quibdó",
      cliente: { estado: "cliente nuevo" },
      adicionales: [{ descripcion: "Envío Cali–Quibdó", valor: 350_000, producto: "PSV016" }],
      productos: [{ codigo: "PSV016", color: "palo rosa", precioDictado: 1_369_000, precioGestion: 1_450_000 }],
    });
    if (result.ok) expect(result.productos[0].aviso).toMatch(/menor/);
    expect(state.created).toBe(0);
    expect(state.clients).toEqual([]);
  });

  it("sin precio usa el de Gestión y no trae aviso; cliente existente avisa que se actualiza", async () => {
    const { deps, state } = fakeDeps();
    state.clients.push({ id: "cli1", document: "900123456" });
    const result = await prepareChatQuote(deps, {
      ...ALDEAS,
      productos: [{ codigo: "sil-01", cantidad: 2 }],
      adicionales: [],
    });
    expect(result).toMatchObject({
      ok: true,
      total: 1_000_000,
      cliente: { estado: "cliente existente: se actualizarán sus datos" },
      productos: [{ precioDictado: null, precioGestion: 500_000, aviso: null }],
    });
    expect(state.created).toBe(0);
  });

  it.each([["Pedro"], ["maría"]])("asesora %j inexistente o ambigua → lista de nombres y no crea nada", async (asesora) => {
    const { deps, state } = fakeDeps();
    for (const fn of [prepareChatQuote, confirmChatQuote]) {
      const result = await fn(deps, { ...ALDEAS, asesora });
      expect(result).toMatchObject({ ok: false, asesoras: ["Ingrid Gómez", "María Camila", "María José"] });
    }
    expect(state.created).toBe(0);
    expect(state.clients).toEqual([]);
  });

  it("faltan datos del cliente → missing y no crea nada", async () => {
    const { deps, state } = fakeDeps();
    const result = await confirmChatQuote(deps, { ...ALDEAS, cliente: { ...ALDEAS.cliente, documento: "" } });
    expect(result).toMatchObject({ ok: false, missing: [{ campo: "document" }] });
    expect(state.created).toBe(0);
  });
});

describe("confirmChatQuote", () => {
  it("crea en borrador a nombre de la asesora, sin origen, con la marca MCP y la bitácora", async () => {
    const { deps, state } = fakeDeps();
    const result = await confirmChatQuote(deps, ALDEAS);
    expect(result).toEqual({
      ok: true,
      reused: false,
      code: "COT-00201",
      shareToken: "tok1",
      shareUrl: "https://magilus.com/cotizaciones/tok1",
      pdfUrl: "https://magilus.com/api/generate-quote-pdf?token=tok1",
      total: 1_719_000,
    });
    expect(state.quotes[0]).toMatchObject({
      createdById: "u1",
      notes: "Entregar en la sede",
      origin: null,
      originDetail: { canal: "MCP", itemsKey: "psv:1" },
    });
    expect(state.logs).toEqual(["Ingrid Gómez|MCP|COT-00201"]);
  });

  it("una segunda confirmación igual antes de 10 minutos devuelve la misma COT; después crea otra", async () => {
    const { deps, state } = fakeDeps();
    await confirmChatQuote(deps, ALDEAS);
    state.clock = new Date(state.clock.getTime() + 9 * 60 * 1000);
    const again = await confirmChatQuote(deps, ALDEAS);
    expect(again).toMatchObject({ ok: true, reused: true, code: "COT-00201" });
    expect(state.created).toBe(1);

    state.clock = new Date(state.clock.getTime() + 2 * 60 * 1000);
    const later = await confirmChatQuote(deps, ALDEAS);
    expect(later).toMatchObject({ ok: true, reused: false, code: "COT-00202" });
  });
});
