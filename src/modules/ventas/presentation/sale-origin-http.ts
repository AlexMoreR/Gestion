import { extractApiKey, isValidApiKey } from "../../asesor/presentation/mcp/auth";
import { registerSaleOriginUseCase, type SaleOriginRepository } from "../application/register-sale-origin";

// Manejo HTTP de POST /api/ventas/origen (el CRM avisa el origen de una cotizacion).
// Usa la API web estandar (Request/Response) para probarlo sin Next, igual que el MCP.
//
// Llave: la misma validacion de /api/catalogo/productos y /api/transporte/ubicaciones
// (extractApiKey + isValidApiKey). Se aceptan las llaves que ya tiene el CRM para esos dos,
// asi no hay que configurar una variable nueva en el stack.

const NO_STORE = { "Cache-Control": "no-store" };

export function isAuthorizedForAnyKey(headers: Headers, expectedKeys: readonly (string | undefined)[]): boolean {
  const provided = extractApiKey(headers);
  return expectedKeys.some((expected) => isValidApiKey(provided, expected));
}

export async function handleSaleOriginPost(
  request: Request,
  deps: { expectedKeys: readonly (string | undefined)[]; repository: SaleOriginRepository },
): Promise<Response> {
  if (!isAuthorizedForAnyKey(request.headers, deps.expectedKeys)) {
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-ventas"' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "datos_invalidos" }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await registerSaleOriginUseCase(deps.repository, body);
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    console.error("[api/ventas/origen] POST", error);
    return Response.json({ error: "error_interno" }, { status: 500, headers: NO_STORE });
  }
}
