import { isAuthorizedForAnyKey } from "../../ventas/presentation/sale-origin-http";

import { createCrmQuoteUseCase, type CrmQuoteDeps } from "../application/create-crm-quote";

// Manejo HTTP de POST /api/cotizaciones (el CRM crea una cotizacion). API web estandar
// (Request/Response) para probarlo sin Next. Misma validacion de llave que /api/ventas/origen.

const NO_STORE = { "Cache-Control": "no-store" };

export async function handleCrmQuotePost(
  request: Request,
  deps: CrmQuoteDeps & { expectedKeys: readonly (string | undefined)[] },
): Promise<Response> {
  if (!isAuthorizedForAnyKey(request.headers, deps.expectedKeys)) {
    return Response.json(
      { ok: false, error: "No autorizado" },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-cotizaciones"' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, missing: [{ campo: "body", mensaje: "Los datos enviados no son JSON" }] },
      { status: 422, headers: NO_STORE },
    );
  }

  try {
    const result = await createCrmQuoteUseCase(deps, body);
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    // Sin el body: trae datos del cliente.
    console.error("[api/cotizaciones] POST", error instanceof Error ? error.message : "error");
    return Response.json({ ok: false, error: "error_interno" }, { status: 500, headers: NO_STORE });
  }
}
