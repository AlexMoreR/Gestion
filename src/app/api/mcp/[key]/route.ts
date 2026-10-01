import type { NextRequest } from "next/server";
import { handleMcpMethodNotAllowed, handleMcpPost } from "@/modules/asesor/presentation/mcp/http";
import { asesorMcpServer } from "@/modules/asesor/presentation/mcp/tools";

// Misma API que /api/mcp, con la llave dentro de la ruta: /api/mcp/{MCP_API_KEY}.
// Para clientes que no permiten headers personalizados (ej. conectores de claude.ai),
// igual que el MCP de AizenCRM. Ojo: la llave queda en la URL (logs de proxy).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { key } = await context.params;
  return handleMcpPost(request, key, process.env.MCP_API_KEY, asesorMcpServer);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { key } = await context.params;
  return handleMcpMethodNotAllowed(key, process.env.MCP_API_KEY);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { key } = await context.params;
  return handleMcpMethodNotAllowed(key, process.env.MCP_API_KEY);
}
