import { describe, expect, it, vi } from "vitest";
import { handlePreciosVigentes } from "./precios-vigentes-http";

const KEY = "llave-de-prueba-de-24-caracteres-o-mas";

describe("GET /api/asesor/precios-vigentes", () => {
  it("responde 401 sin llave o con llave mala, sin armar la hoja", async () => {
    const buildSheet = vi.fn(async () => "# hoja");
    const sinLlave = await handlePreciosVigentes(new Request("http://x/"), KEY, buildSheet);
    const llaveMala = await handlePreciosVigentes(
      new Request("http://x/", { headers: { authorization: "Bearer otra-llave-cualquiera-de-24-chars" } }),
      KEY,
      buildSheet,
    );
    expect(sinLlave.status).toBe(401);
    expect(llaveMala.status).toBe(401);
    expect(buildSheet).not.toHaveBeenCalled();
  });

  it("con la llave buena entrega Markdown sin cache", async () => {
    const response = await handlePreciosVigentes(
      new Request("http://x/", { headers: { "x-api-key": KEY } }),
      KEY,
      async () => "# hoja",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("# hoja");
  });
});
