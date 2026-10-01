import { describe, expect, it } from "vitest";
import { handleMcpMethodNotAllowed, handleMcpPost } from "./http";
import type { McpServerDefinition } from "./protocol";

const KEY = "llave-de-prueba-suficientemente-larga-123";
const server: McpServerDefinition = { name: "prueba", version: "0.0.1", tools: [] };

function post(body: string): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("HTTP del servidor MCP", () => {
  it("responde initialize con la llave correcta (venga del header o de la ruta)", async () => {
    const response = await handleMcpPost(
      post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })),
      KEY,
      KEY,
      server,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 1, result: { serverInfo: { name: "prueba" } } });
  });

  it("devuelve 401 sin llave, con llave incorrecta o sin llave configurada", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect((await handleMcpPost(post(body), null, KEY, server)).status).toBe(401);
    expect((await handleMcpPost(post(body), `${KEY}-mal`, KEY, server)).status).toBe(401);
    expect((await handleMcpPost(post(body), KEY, undefined, server)).status).toBe(401);
  });

  it("devuelve 400 si el cuerpo no es JSON", async () => {
    const response = await handleMcpPost(post("{no es json"), KEY, KEY, server);
    expect(response.status).toBe(400);
  });

  it("GET/DELETE: 401 sin llave y 405 con llave", () => {
    expect(handleMcpMethodNotAllowed(null, KEY).status).toBe(401);
    const allowed = handleMcpMethodNotAllowed(KEY, KEY);
    expect(allowed.status).toBe(405);
    expect(allowed.headers.get("Allow")).toBe("POST");
  });
});
