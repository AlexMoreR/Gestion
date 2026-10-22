import { extractApiKey, isValidApiKey } from "../../asesor/presentation/mcp/auth";
import {
  leerFiltrosDelCatalogo,
  type FiltrosDelCatalogo,
  type ProductoDelCatalogo,
} from "../domain/producto-del-catalogo";

// Manejo HTTP de GET /api/catalogo/productos y GET /api/catalogo/productos/[code].
// API web estandar (Request/Response) para probarlo sin Next. Contrato en docs/api-catalogo.md.

const NO_STORE = { "Cache-Control": "no-store" };

export type CatalogoDeps = {
  expectedKey: string | undefined;
  listar: (filtros: FiltrosDelCatalogo) => Promise<ProductoDelCatalogo[]>;
  buscarPorCodigo: (codigo: string) => Promise<ProductoDelCatalogo | null>;
  ahora?: () => Date;
};

function noAutorizado(): Response {
  return Response.json(
    { error: "No autorizado" },
    { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-catalogo"' } },
  );
}

export async function handleCatalogoList(request: Request, deps: CatalogoDeps): Promise<Response> {
  if (!isValidApiKey(extractApiKey(request.headers), deps.expectedKey)) {
    return noAutorizado();
  }
  const lectura = leerFiltrosDelCatalogo(new URL(request.url).searchParams);
  if (!lectura.ok) {
    return Response.json({ error: lectura.error }, { status: 400, headers: NO_STORE });
  }
  const productos = await deps.listar(lectura.filtros);
  return Response.json(
    { generado_el: (deps.ahora?.() ?? new Date()).toISOString(), total: productos.length, productos },
    { headers: NO_STORE },
  );
}

export async function handleCatalogoByCode(request: Request, codigo: string, deps: CatalogoDeps): Promise<Response> {
  if (!isValidApiKey(extractApiKey(request.headers), deps.expectedKey)) {
    return noAutorizado();
  }
  const limpio = codigo.trim();
  const producto = limpio ? await deps.buscarPorCodigo(limpio) : null;
  if (!producto) {
    return Response.json({ error: "No encontrado", codigo: limpio }, { status: 404, headers: NO_STORE });
  }
  return Response.json(
    { generado_el: (deps.ahora?.() ?? new Date()).toISOString(), producto },
    { headers: NO_STORE },
  );
}

/** CATALOGO_API_KEY si existe; si no, la MCP_API_KEY del asesor. Menos de 24 caracteres = nadie entra. */
export function llaveDelCatalogo(): string | undefined {
  return process.env.CATALOGO_API_KEY?.trim() || process.env.MCP_API_KEY;
}
