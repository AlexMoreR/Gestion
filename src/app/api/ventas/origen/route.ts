import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { createPrismaSaleOriginRepository } from "@/modules/ventas/infrastructure/prisma-sale-origin-repository";
import { handleSaleOriginPost } from "@/modules/ventas/presentation/sale-origin-http";

// Origen de cada venta: el CRM (AizenCRM) avisa al marcar un chat GANADO con su cotizacion.
// POST { quoteCode, origin, originDetail?, linea?, contactPhone? }
//   200 { ok: true, quoteCode, origin, saleUpdated } · 404 { error: "cotizacion_no_existe" }
//   400 { error: "datos_invalidos" } · 401 sin llave valida.
// REFERIDO_RECURRENTE se resuelve aqui (RECURRENTE si el cliente ya tenia ventas, si no REFERIDO).
// contactPhone solo se usa para esa decision: no se guarda. Reglas en modules/ventas/domain/sale-origin.ts.
//
// Llave en "Authorization: Bearer" o "x-api-key": se acepta la del catalogo (CATALOGO_API_KEY, si no
// MCP_API_KEY) o la de transporte (TRANSPORTE_API_KEY, si no las anteriores). Son las que el CRM ya usa.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function llavesAceptadas(): (string | undefined)[] {
  const catalogo = process.env.CATALOGO_API_KEY?.trim() || process.env.MCP_API_KEY;
  const transporte = process.env.TRANSPORTE_API_KEY?.trim() || catalogo;
  return [catalogo, transporte];
}

export async function POST(request: NextRequest) {
  return handleSaleOriginPost(request, {
    expectedKeys: llavesAceptadas(),
    repository: createPrismaSaleOriginRepository(prisma),
  });
}
