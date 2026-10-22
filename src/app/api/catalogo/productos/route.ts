import type { NextRequest } from "next/server";

import {
  buscarProductoPorCodigo,
  listarCatalogoParaOtrasApps,
} from "@/modules/catalogo-externo/application/listar-catalogo";
import { handleCatalogoList, llaveDelCatalogo } from "@/modules/catalogo-externo/presentation/catalogo-http";

// Catalogo de productos para otras apps (AizenCRM y NETMAGI se sincronizan desde aca). Solo lectura.
// Llave en "Authorization: Bearer" o "x-api-key": CATALOGO_API_KEY si existe, y si no la misma
// MCP_API_KEY del asesor (asi no hace falta tocar el stack para prenderlo). Sin llave valida: 401.
// Filtros opcionales: ?code=, ?categoria=<slug>, ?incluirOcultos=0|1 (por defecto 1).
// Nunca devuelve costo ni margen. Contrato: docs/api-catalogo.md.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleCatalogoList(request, {
    expectedKey: llaveDelCatalogo(),
    listar: listarCatalogoParaOtrasApps,
    buscarPorCodigo: buscarProductoPorCodigo,
  });
}
