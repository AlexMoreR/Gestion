import { NextResponse, type NextRequest } from "next/server";
import { extractApiKey, isValidApiKey } from "@/modules/asesor/presentation/mcp/auth";
import { handleMcpPayload, JSON_RPC_ERRORS, jsonRpcError } from "@/modules/asesor/presentation/mcp/protocol";
import { asesorMcpServer } from "@/modules/asesor/presentation/mcp/tools";

// Servidor MCP de SOLO LECTURA para el asesor de IA (transporte Streamable HTTP,
// sin sesion: cada POST se responde con JSON). Protegido con MCP_API_KEY.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(): NextResponse {
  return NextResponse.json(jsonRpcError(null, -32001, "No autorizado: falta la llave o no es valida."), {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer realm="gestion-mcp"' },
  });
}

function isAuthorized(request: NextRequest): boolean {
  return isValidApiKey(extractApiKey(request.headers), process.env.MCP_API_KEY);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(jsonRpcError(null, JSON_RPC_ERRORS.PARSE_ERROR, "JSON invalido."), { status: 400 });
  }

  const result = await handleMcpPayload(payload, asesorMcpServer);
  if (result.body === undefined) {
    return new NextResponse(null, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}

// Sin stream SSE ni sesiones: GET y DELETE no aplican en este servidor.
function methodNotAllowed(request: NextRequest): NextResponse {
  if (!isAuthorized(request)) {
    return unauthorized();
  }
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function GET(request: NextRequest) {
  return methodNotAllowed(request);
}

export function DELETE(request: NextRequest) {
  return methodNotAllowed(request);
}
