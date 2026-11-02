import { afterEach, describe, expect, it, vi } from "vitest";

// La base nunca se toca: sin llave valida la ruta responde antes de leer productos.
const { preciosVigentesUseCase } = vi.hoisted(() => ({ preciosVigentesUseCase: vi.fn(async () => "# Precios vigentes\n") }));
vi.mock("../../../../modules/asesor/application/use-cases", () => ({ preciosVigentesUseCase }));
vi.mock("../../../../modules/asesor/infrastructure/prisma-asesor-repository", () => ({
  createPrismaAsesorRepository: () => ({}),
}));

import { GET } from "./route";

const KEY = "llave-de-prueba-de-24-caracteres-o-mas";
const url = "https://magilus.com/api/asesor/precios-vigentes";

describe("GET /api/asesor/precios-vigentes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    preciosVigentesUseCase.mockClear();
  });

  it("sin llave o con llave mala responde 401 y no lee nada", async () => {
    vi.stubEnv("MCP_API_KEY", KEY);
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await GET(new Request(url, { headers: { authorization: "Bearer otra-llave-que-no-es-la-buena-123" } }))).status).toBe(401);
    expect(preciosVigentesUseCase).not.toHaveBeenCalled();
  });

  it("con la llave del MCP responde la hoja en Markdown sin cache", async () => {
    vi.stubEnv("MCP_API_KEY", KEY);
    const response = await GET(new Request(url, { headers: { "x-api-key": KEY } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("# Precios vigentes\n");
  });
});
