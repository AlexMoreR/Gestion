import type { NextRequest } from "next/server";
import { extractApiKey } from "@/modules/asesor/presentation/mcp/auth";
import { handleMcpMethodNotAllowed, handleMcpPost } from "@/modules/asesor/presentation/mcp/http";
import { asesorMcpServer } from "@/modules/asesor/presentation/mcp/tools";

// Servidor MCP de SOLO LECTURA para el asesor de IA (transporte Streamable HTTP,
// sin sesion). Llave MCP_API_KEY en "Authorization: Bearer" o "x-api-key".
// Variante con la llave en la ruta: /api/mcp/[key].

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handleMcpPost(request, extractApiKey(request.headers), process.env.MCP_API_KEY, asesorMcpServer);
}

export function GET(request: NextRequest) {
  return handleMcpMethodNotAllowed(extractApiKey(request.headers), process.env.MCP_API_KEY);
}

export function DELETE(request: NextRequest) {
  return handleMcpMethodNotAllowed(extractApiKey(request.headers), process.env.MCP_API_KEY);
}
