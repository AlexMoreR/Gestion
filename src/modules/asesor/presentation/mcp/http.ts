import { isValidApiKey } from "./auth";
import { handleMcpPayload, JSON_RPC_ERRORS, jsonRpcError, type McpServerDefinition } from "./protocol";

// Manejo HTTP comun para /api/mcp (llave en header) y /api/mcp/{llave} (llave en
// la ruta, para clientes como claude.ai que no permiten headers personalizados).
// Usa la API web estandar (Request/Response) para no atarse a Next.

function unauthorized(): Response {
  return Response.json(jsonRpcError(null, -32001, "No autorizado: falta la llave o no es valida."), {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer realm="gestion-mcp"' },
  });
}

export async function handleMcpPost(
  request: Request,
  providedKey: string | null,
  expectedKey: string | undefined,
  server: McpServerDefinition,
): Promise<Response> {
  if (!isValidApiKey(providedKey, expectedKey)) {
    return unauthorized();
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(jsonRpcError(null, JSON_RPC_ERRORS.PARSE_ERROR, "JSON invalido."), { status: 400 });
  }

  const result = await handleMcpPayload(payload, server);
  if (result.body === undefined) {
    return new Response(null, { status: result.status });
  }
  return Response.json(result.body, { status: result.status });
}

// Sin stream SSE ni sesiones: GET y DELETE no aplican. Se valida la llave primero
// para no revelar nada a quien no la tenga.
export function handleMcpMethodNotAllowed(providedKey: string | null, expectedKey: string | undefined): Response {
  if (!isValidApiKey(providedKey, expectedKey)) {
    return unauthorized();
  }
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
