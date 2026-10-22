import type { NextRequest } from "next/server";

import {
  buscarProductoPorCodigo,
  listarCatalogoParaOtrasApps,
} from "@/modules/catalogo-externo/application/listar-catalogo";
import { handleCatalogoByCode, llaveDelCatalogo } from "@/modules/catalogo-externo/presentation/catalogo-http";

// Un producto del catalogo por codigo exacto (sin distinguir mayusculas). Misma llave que la lista.
// 200 { generado_el, producto } · 404 { error: "No encontrado", codigo } · 401 sin llave valida.
// Contrato: docs/api-catalogo.md.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  return handleCatalogoByCode(request, code, {
    expectedKey: llaveDelCatalogo(),
    listar: listarCatalogoParaOtrasApps,
    buscarPorCodigo: buscarProductoPorCodigo,
  });
}
