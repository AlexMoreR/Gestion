import type { NextRequest } from "next/server";

import { createPrismaDudasRepository } from "@/modules/dudas/infrastructure/prisma-dudas-repository";
import { handleRespuestasDudas, llaveDeDudas } from "@/modules/dudas/presentation/respuestas-http";

// Respuestas de "Dudas del catalogo" para Claude (solo lectura). Llave Bearer: DUDAS_API_KEY,
// si no CATALOGO_API_KEY, si no MCP_API_KEY. Sin llave valida: 401.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const repo = createPrismaDudasRepository();
  return handleRespuestasDudas(request, {
    expectedKey: llaveDeDudas(),
    listarDudas: repo.listarDudas,
    listarRespuestas: repo.listarRespuestas,
  });
}
