import { describe, expect, it } from "vitest";

import type { Duda, Respuesta } from "../domain/duda";
import { handleRespuestasDudas, llaveDeDudas } from "./respuestas-http";

const KEY = "llave-de-prueba-suficientemente-larga-123";

const duda = (id: string, grupo = "nombre"): Duda => ({
  id,
  codigo: null,
  grupo,
  titulo: `t ${id}`,
  duda: "",
  orden: 1,
  datos: [],
  opciones: [{ id: "ok", label: "Ok" }],
  links: [],
  extra: null,
  activa: true,
});

const respuesta = (dudaId: string, ms: number, texto = ""): Respuesta => ({
  id: `${dudaId}-${ms}`,
  dudaId,
  opcionId: "ok",
  opcionTexto: "Ok",
  texto,
  nota: "",
  autorNombre: "Ingrid",
  accesoId: "a1",
  createdAt: new Date(ms),
});

const deps = {
  expectedKey: KEY,
  listarDudas: async () => [duda("q1"), duda("q2", "foto")],
  listarRespuestas: async () => [respuesta("q1", 1, "viejo"), respuesta("q1", 2, "nuevo")],
  ahora: () => new Date("2026-10-26T00:00:00Z"),
};

describe("GET /api/dudas/respuestas", () => {
  it("sin llave o con llave equivocada: 401", async () => {
    expect((await handleRespuestasDudas(new Request("https://x/api/dudas/respuestas"), deps)).status).toBe(401);
    const mala = new Request("https://x/api/dudas/respuestas", { headers: { authorization: "Bearer otra-llave-larga-pero-equivocada" } });
    expect((await handleRespuestasDudas(mala, deps)).status).toBe(401);
  });

  it("con llave devuelve la respuesta vigente y, si se pide, el historial", async () => {
    const req = new Request("https://x/api/dudas/respuestas?estado=respondidas&historial=1", { headers: { authorization: `Bearer ${KEY}` } });
    const res = await handleRespuestasDudas(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ total: 2, pendientes: 1, respondidas: 1 });
    expect(body.dudas).toHaveLength(1);
    expect(body.dudas[0].respuesta).toMatchObject({ texto: "nuevo", por: "Ingrid" });
    expect(body.dudas[0].historial.map((h: { texto: string }) => h.texto)).toEqual(["nuevo", "viejo"]);
  });

  it("filtro invalido: 400", async () => {
    const req = new Request("https://x/api/dudas/respuestas?grupo=nada", { headers: { "x-api-key": KEY } });
    expect((await handleRespuestasDudas(req, deps)).status).toBe(400);
  });

  it("la llave sale de DUDAS_API_KEY, si no CATALOGO_API_KEY, si no MCP_API_KEY", () => {
    expect(llaveDeDudas({ DUDAS_API_KEY: "a", CATALOGO_API_KEY: "b", MCP_API_KEY: "c" })).toBe("a");
    expect(llaveDeDudas({ CATALOGO_API_KEY: "b", MCP_API_KEY: "c" })).toBe("b");
    expect(llaveDeDudas({ MCP_API_KEY: "c" })).toBe("c");
  });
});
