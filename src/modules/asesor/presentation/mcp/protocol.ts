// Nucleo minimo del protocolo MCP (JSON-RPC 2.0) para el transporte Streamable
// HTTP en modo sin sesion: cada POST trae un mensaje (o lote) y se responde con
// application/json. Independiente de Next y de Prisma para poder probarlo.

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  run: (args: Record<string, unknown>) => Promise<McpToolResult>;
};

export type McpServerDefinition = {
  name: string;
  version: string;
  instructions?: string;
  tools: McpToolDefinition[];
};

export type McpHttpResult = {
  status: number;
  body?: unknown;
};

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

type JsonRpcId = string | number | null;

class McpProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readId(message: unknown): JsonRpcId {
  if (isRecord(message) && (typeof message.id === "string" || typeof message.id === "number")) {
    return message.id;
  }
  return null;
}

export function jsonRpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

async function dispatch(method: string, params: unknown, server: McpServerDefinition): Promise<unknown> {
  switch (method) {
    case "initialize": {
      const requested = isRecord(params) ? params.protocolVersion : undefined;
      const protocolVersion =
        typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, version: server.version },
        ...(server.instructions ? { instructions: server.instructions } : {}),
      };
    }

    case "ping":
      return {};

    case "tools/list":
      return {
        // `run` es interno: no se expone.
        tools: server.tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        })),
      };

    case "tools/call": {
      if (!isRecord(params) || typeof params.name !== "string") {
        throw new McpProtocolError(JSON_RPC_ERRORS.INVALID_PARAMS, "Falta el nombre de la herramienta.");
      }
      const tool = server.tools.find((candidate) => candidate.name === params.name);
      if (!tool) {
        throw new McpProtocolError(JSON_RPC_ERRORS.INVALID_PARAMS, `Herramienta desconocida: ${params.name}`);
      }
      const args = params.arguments ?? {};
      if (!isRecord(args)) {
        throw new McpProtocolError(JSON_RPC_ERRORS.INVALID_PARAMS, "Los argumentos deben ser un objeto.");
      }
      return tool.run(args);
    }

    default:
      throw new McpProtocolError(JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Metodo no soportado: ${method}`);
  }
}

// Procesa un mensaje JSON-RPC. Devuelve la respuesta, o null si no corresponde
// responder (notificaciones y respuestas enviadas por el cliente).
async function handleMessage(message: unknown, server: McpServerDefinition): Promise<unknown | null> {
  if (!isRecord(message) || message.jsonrpc !== "2.0") {
    return jsonRpcError(readId(message), JSON_RPC_ERRORS.INVALID_REQUEST, "Solicitud JSON-RPC invalida.");
  }

  if (typeof message.method !== "string") {
    // Una respuesta del cliente (result/error) no se contesta.
    if ("result" in message || "error" in message) return null;
    return jsonRpcError(readId(message), JSON_RPC_ERRORS.INVALID_REQUEST, "Falta el metodo.");
  }

  // Notificacion (sin id): se acepta sin responder.
  if (!("id" in message) || message.id === undefined) {
    return null;
  }

  const id = readId(message);
  try {
    const result = await dispatch(message.method, message.params, server);
    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    if (error instanceof McpProtocolError) {
      return jsonRpcError(id, error.code, error.message);
    }
    console.error("[mcp] Error interno:", error);
    return jsonRpcError(id, JSON_RPC_ERRORS.INTERNAL_ERROR, "Error interno del servidor.");
  }
}

// Punto de entrada: recibe el cuerpo ya parseado de un POST.
export async function handleMcpPayload(payload: unknown, server: McpServerDefinition): Promise<McpHttpResult> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return { status: 400, body: jsonRpcError(null, JSON_RPC_ERRORS.INVALID_REQUEST, "Lote vacio.") };
    }
    const responses = (await Promise.all(payload.map((message) => handleMessage(message, server)))).filter(
      (response) => response !== null,
    );
    return responses.length > 0 ? { status: 200, body: responses } : { status: 202 };
  }

  const response = await handleMessage(payload, server);
  return response === null ? { status: 202 } : { status: 200, body: response };
}
