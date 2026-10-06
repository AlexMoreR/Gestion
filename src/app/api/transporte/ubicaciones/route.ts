import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { extractApiKey, isValidApiKey } from "@/modules/asesor/presentation/mcp/auth";
import { normalizePlaceName, quoteShipping } from "@/modules/transporte/domain/shipping";
import {
  addLocalityIfMissing,
  ensureTransportSeed,
  findProductShippingInfo,
  searchPlacesForExternalApps,
} from "@/modules/transporte/infrastructure/transporte-repository";

// Ubicaciones y tipo de envio para otras apps (el CRM de las asesoras). Gestion es la fuente unica.
// Llave en "Authorization: Bearer" o "x-api-key": TRANSPORTE_API_KEY si existe, si no CATALOGO_API_KEY,
// y si no la MCP_API_KEY del asesor. Sin llave valida: 401.
//
// GET  ?q=<texto>&producto=<codigo opcional>&limit=<1..50, def 20>  -> busca ciudades y corregimientos
// POST { cityId, nombre, origen? }  -> agrega un corregimiento/barrio bajo una ciudad (sin duplicar);
//      queda "pendiente de revisar" en /admin/transporte.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function llaveEsperada(): string | undefined {
  return process.env.TRANSPORTE_API_KEY?.trim() || process.env.CATALOGO_API_KEY?.trim() || process.env.MCP_API_KEY;
}

function noAutorizado() {
  return NextResponse.json(
    { error: "No autorizado" },
    { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-transporte"' } },
  );
}

function errorJson(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function parseLimit(raw: string | null): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) {
    return 20;
  }
  return Math.min(Math.max(value, 1), 50);
}

export async function GET(request: NextRequest) {
  if (!isValidApiKey(extractApiKey(request.headers), llaveEsperada())) {
    return noAutorizado();
  }

  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").slice(0, 120);
  if (normalizePlaceName(q).length < 2) {
    return errorJson(400, "El parametro q debe tener al menos 2 caracteres");
  }
  const limit = parseLimit(params.get("limit"));
  const codigoProducto = (params.get("producto") ?? "").trim().slice(0, 60);

  try {
    await ensureTransportSeed();
    const [lugares, producto] = await Promise.all([
      searchPlacesForExternalApps(q, limit),
      codigoProducto ? findProductShippingInfo(codigoProducto) : Promise.resolve(null),
    ]);

    const resultados = lugares.map((lugar) => ({
      ...lugar,
      cotizacion: producto
        ? quoteShipping({ tipo: lugar.envio, price: producto.precio, shippingExtra: producto.envioAdicional })
        : null,
    }));

    return NextResponse.json({ resultados, producto }, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/transporte/ubicaciones] GET", error);
    return errorJson(500, "No se pudo consultar las ubicaciones");
  }
}

const crearSchema = z.object({
  cityId: z.string().trim().min(1, "cityId es obligatorio").max(64),
  nombre: z.string().trim().min(2, "nombre debe tener entre 2 y 80 caracteres").max(80, "nombre debe tener entre 2 y 80 caracteres"),
  origen: z.string().trim().max(200).optional(),
});

export async function POST(request: NextRequest) {
  if (!isValidApiKey(extractApiKey(request.headers), llaveEsperada())) {
    return noAutorizado();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(400, "El cuerpo debe ser JSON");
  }

  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(400, parsed.error.issues[0]?.message ?? "Datos invalidos");
  }
  if (normalizePlaceName(parsed.data.nombre).length < 2) {
    return errorJson(400, "nombre debe tener entre 2 y 80 caracteres");
  }

  const source = (parsed.data.origen || "CRM").slice(0, 20);

  try {
    const resultado = await addLocalityIfMissing({ cityId: parsed.data.cityId, name: parsed.data.nombre, source });
    if (!resultado) {
      return errorJson(404, "Ciudad no encontrada");
    }
    return NextResponse.json(resultado, { status: resultado.creado ? 201 : 200, headers: NO_STORE });
  } catch (error) {
    console.error("[api/transporte/ubicaciones] POST", error);
    return errorJson(500, "No se pudo guardar la ubicacion");
  }
}
