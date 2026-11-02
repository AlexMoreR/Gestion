import { afterEach, describe, expect, it } from "vitest";

import { handleRevisorRequest, parseSaldosAyer } from "./http";

const KEY = "llave-de-prueba-suficientemente-larga-123";
const revisar = async (saldosAyer: Record<string, number> | null) => ({
  fecha: "2026-11-02",
  fechaSaldos: "2026-11-01",
  hallazgos: [],
  saldos: saldosAyer ?? {},
});

afterEach(() => {
  delete process.env.REVISOR_API_KEY;
  delete process.env.MCP_API_KEY;
});

describe("handleRevisorRequest", () => {
  it("405 si no es GET y 401 sin llave", async () => {
    process.env.REVISOR_API_KEY = KEY;
    const post = await handleRevisorRequest(new Request("http://x/api/revisor", { method: "POST" }), revisar);
    expect(post.status).toBe(405);
    const sinLlave = await handleRevisorRequest(new Request("http://x/api/revisor"), revisar);
    expect(sinLlave.status).toBe(401);
  });

  it("acepta la llave de MCP si no hay REVISOR_API_KEY y pasa saldosAyer", async () => {
    process.env.MCP_API_KEY = KEY;
    const url = `http://x/api/revisor?saldosAyer=${encodeURIComponent('{"c1":1000}')}`;
    const res = await handleRevisorRequest(new Request(url, { headers: { "x-api-key": KEY } }), revisar);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ fecha: "2026-11-02", hallazgos: [], saldos: { c1: 1000 } });
  });

  it("400 con saldosAyer mal formado", async () => {
    process.env.REVISOR_API_KEY = KEY;
    const res = await handleRevisorRequest(
      new Request("http://x/api/revisor?saldosAyer=[1]", { headers: { authorization: `Bearer ${KEY}` } }),
      revisar,
    );
    expect(res.status).toBe(400);
  });
});

describe("parseSaldosAyer", () => {
  it("null si no vino, undefined si no es un objeto de números", () => {
    expect(parseSaldosAyer(null)).toBeNull();
    expect(parseSaldosAyer('{"a":"x"}')).toBeUndefined();
    expect(parseSaldosAyer("nada")).toBeUndefined();
    expect(parseSaldosAyer('{"a":-5}')).toEqual({ a: -5 });
  });
});
