import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { createPrismaCrmQuoteRepository } from "@/modules/cotizaciones-crm/infrastructure/prisma-crm-quote-repository";
import { handleCrmQuotePost } from "@/modules/cotizaciones-crm/presentation/crm-quote-http";

// Crear cotizacion desde el CRM (AizenCRM, boton "Generar cotizacion" de la ficha del chat).
// POST {
//   client: { fullName, document, email?, phone, city, department, address, neighborhood? },
//   items: [{ productCode | productId, quantity }],      // SIN precio: se usa el de Gestion
//   asesoraEmail?, origin? (META_ADS|MARKETPLACE|REFERIDO_RECURRENTE|...), linea? ("Ventas 1"...),
//   crmConversationId?, crmContactId?, notes?
// }
//   201 { ok, reused:false, quoteId, code, total, shareUrl, pdfUrl, createdBy:{email,name,fallback}, missing:[] }
//   200 igual con reused:true (mismo crmConversationId + mismos productos en 10 min)
//   422 { ok:false, missing:[{campo, mensaje}] } -> no se crea nada
//   401 sin llave valida · 500 { ok:false, error }
// Reglas en modules/cotizaciones-crm/domain/crm-quote-request.ts.
//
// Llave en "Authorization: Bearer" o "x-api-key": CRM_API_KEY si existe, si no las que el CRM ya usa
// (CATALOGO_API_KEY o MCP_API_KEY, TRANSPORTE_API_KEY).
// Creador: el usuario de Gestion con el correo de la asesora (asesoraEmail); si no existe,
// CRM_QUOTE_SYSTEM_USER_EMAIL; si no, el primer ADMIN.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function llavesAceptadas(): (string | undefined)[] {
  const catalogo = process.env.CATALOGO_API_KEY?.trim() || process.env.MCP_API_KEY;
  const transporte = process.env.TRANSPORTE_API_KEY?.trim() || catalogo;
  return [process.env.CRM_API_KEY?.trim() || undefined, catalogo, transporte];
}

export async function POST(request: NextRequest) {
  return handleCrmQuotePost(request, {
    expectedKeys: llavesAceptadas(),
    repository: createPrismaCrmQuoteRepository(prisma),
    shareUrl: (token) => getSiteUrl(`/cotizaciones/${token}`),
    pdfUrl: (token) => getSiteUrl(`/api/generate-quote-pdf?token=${encodeURIComponent(token)}`),
    systemUserEmail: process.env.CRM_QUOTE_SYSTEM_USER_EMAIL,
    newComboKey: () => randomUUID(),
  });
}
