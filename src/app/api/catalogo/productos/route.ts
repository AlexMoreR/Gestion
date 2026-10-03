import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listarCatalogoParaOtrasApps } from "@/modules/catalogo-externo/application/listar-catalogo";
import { extractApiKey, isValidApiKey } from "@/modules/asesor/presentation/mcp/auth";

// Catalogo de productos para otras apps (el CRM se sincroniza desde aca). Solo lectura.
// Llave en "Authorization: Bearer" o "x-api-key": CATALOGO_API_KEY si existe, y si no la misma
// MCP_API_KEY del asesor (asi no hace falta tocar el stack para prenderlo). Sin llave valida: 401.
// Nunca devuelve costo ni margen: ver listar-catalogo.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function llaveEsperada(): string | undefined {
  return process.env.CATALOGO_API_KEY?.trim() || process.env.MCP_API_KEY;
}

export async function GET(request: NextRequest) {
  if (!isValidApiKey(extractApiKey(request.headers), llaveEsperada())) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="gestion-catalogo"' } },
    );
  }

  const productos = await listarCatalogoParaOtrasApps();
  return NextResponse.json(
    { generado_el: new Date().toISOString(), total: productos.length, productos },
    { headers: { "Cache-Control": "no-store" } },
  );
}
