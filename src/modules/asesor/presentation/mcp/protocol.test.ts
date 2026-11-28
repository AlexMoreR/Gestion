import { describe, expect, it, vi } from "vitest";

// tools.ts carga modulos de servidor de Next; en la prueba no hacen falta.
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => null }));
import { handleMcpPayload, JSON_RPC_ERRORS, type McpServerDefinition } from "./protocol";

const server: McpServerDefinition = {
  name: "prueba",
  version: "0.0.1",
  instructions: "Solo lectura.",
  tools: [
    {
      name: "eco",
      title: "Eco",
      description: "Devuelve lo que recibe.",
      inputSchema: { type: "object", properties: { texto: { type: "string" } } },
      annotations: { readOnlyHint: true },
      run: async (args) => ({ content: [{ type: "text", text: String(args.texto ?? "") }] }),
    },
  ],
};

describe("protocolo MCP", () => {
  it("negocia la version del protocolo en initialize", async () => {
    const known = await handleMcpPayload(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      server,
    );
    expect(known.status).toBe(200);
    expect(known.body).toMatchObject({
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "prueba", version: "0.0.1" },
        instructions: "Solo lectura.",
      },
    });

    const unknown = await handleMcpPayload(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      server,
    );
    expect(unknown.body).toMatchObject({ result: { protocolVersion: "2025-06-18" } });
  });

  it("lista herramientas sin exponer la funcion interna", async () => {
    const result = await handleMcpPayload({ jsonrpc: "2.0", id: "a", method: "tools/list" }, server);
    const tools = (result.body as { result: { tools: Record<string, unknown>[] } }).result.tools;
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: "eco", annotations: { readOnlyHint: true } });
    expect(tools[0]).not.toHaveProperty("run");
  });

  it("ejecuta una herramienta", async () => {
    const result = await handleMcpPayload(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "eco", arguments: { texto: "hola" } } },
      server,
    );
    expect(result.body).toEqual({ jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: "hola" }] } });
  });

  it("rechaza herramientas desconocidas y metodos no soportados", async () => {
    const unknownTool = await handleMcpPayload(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "borrar_todo" } },
      server,
    );
    expect(unknownTool.body).toMatchObject({ error: { code: JSON_RPC_ERRORS.INVALID_PARAMS } });

    const unknownMethod = await handleMcpPayload({ jsonrpc: "2.0", id: 5, method: "resources/list" }, server);
    expect(unknownMethod.body).toMatchObject({ error: { code: JSON_RPC_ERRORS.METHOD_NOT_FOUND } });
  });

  it("acepta notificaciones sin responder (202)", async () => {
    const result = await handleMcpPayload({ jsonrpc: "2.0", method: "notifications/initialized" }, server);
    expect(result).toEqual({ status: 202 });
  });

  it("responde mensajes invalidos con error JSON-RPC", async () => {
    const result = await handleMcpPayload({ hola: "mundo" }, server);
    expect(result.body).toMatchObject({ error: { code: JSON_RPC_ERRORS.INVALID_REQUEST } });
  });

  it("procesa lotes y omite las notificaciones", async () => {
    const result = await handleMcpPayload(
      [
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ],
      server,
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
  });
});

describe("servidor MCP de Gestion", () => {
  it("lista ver_inventario como solo lectura", async () => {
    const { asesorMcpServer } = await import("./tools");
    const result = await handleMcpPayload({ jsonrpc: "2.0", id: "inv", method: "tools/list" }, asesorMcpServer);
    const tools = (result.body as { result: { tools: { name: string; description: string; annotations?: unknown }[] } })
      .result.tools;
    const tool = tools.find((t) => t.name === "ver_inventario");
    expect(tool).toBeDefined();
    expect(tool?.description).toContain("SOLO LECTURA");
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true });
    expect(asesorMcpServer.instructions).toContain("ver_inventario");
  });
});
