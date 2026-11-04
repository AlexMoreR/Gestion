import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// La base nunca se toca: el repositorio va simulado con Bogotá (contraentrega 120000) y un lugar "No llegamos".
const repo = vi.hoisted(() => ({
  ensureTransportSeed: vi.fn(async () => {}),
  addLocalityIfMissing: vi.fn(),
  searchPlacesForExternalApps: vi.fn(async () => [
    { tipo: "ciudad", id: "c1", cityId: "c1", nombre: "Bogotá, D.C.", ciudad: "Bogotá, D.C.", departamento: "Bogotá, D.C.", envio: "GRATIS", pendienteRevision: false, exacta: true, envioContraentrega: 120000 },
    { tipo: "ciudad", id: "c2", cityId: "c2", nombre: "Leticia", ciudad: "Leticia", departamento: "Amazonas", envio: "NO_LLEGA", pendienteRevision: false, exacta: false, envioContraentrega: 90000 },
  ]),
  findProductShippingInfo: vi.fn(async (code: string) => ({ codigo: code.toUpperCase(), nombre: "X", precio: 1000000, envioAdicional: null })),
}));
vi.mock("../../../../modules/transporte/infrastructure/transporte-repository", () => repo);

import { GET } from "./route";

const KEY = "llave-de-prueba-de-24-caracteres-o-mas";
const get = (query: string) =>
  GET(new NextRequest(`https://magilus.com/api/transporte/ubicaciones?${query}`, { headers: { "x-api-key": KEY } }));

describe("GET /api/transporte/ubicaciones: contraentrega", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("con el combo de camillas devuelve el valor; en No llegamos, null; no expone el campo interno", async () => {
    vi.stubEnv("TRANSPORTE_API_KEY", KEY);
    const body = await (await get("q=bogota&producto=CMB005")).json();
    expect(body.resultados[0]).toMatchObject({ nombre: "Bogotá, D.C.", envio: "GRATIS", contraentrega: { envio: 120000 } });
    expect(body.resultados[0]).not.toHaveProperty("envioContraentrega");
    expect(body.resultados[1].contraentrega).toBeNull();
  });

  it("con otro producto o sin producto, contraentrega es null", async () => {
    vi.stubEnv("TRANSPORTE_API_KEY", KEY);
    for (const query of ["q=bogota&producto=SIL001", "q=bogota"]) {
      const body = await (await get(query)).json();
      expect(body.resultados[0].contraentrega).toBeNull();
      expect(body.resultados[0]).toMatchObject({ tipo: "ciudad", cityId: "c1", exacta: true, pendienteRevision: false });
    }
  });
});
