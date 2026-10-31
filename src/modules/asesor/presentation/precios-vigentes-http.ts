import { extractApiKey, isValidApiKey } from "./mcp/auth";

// GET de la hoja "Precios vigentes". Lleva COSTO: solo con la llave MCP_API_KEY (no la del catalogo).
export async function handlePreciosVigentes(
  request: Request,
  expectedKey: string | undefined,
  buildSheet: () => Promise<string>,
): Promise<Response> {
  if (!isValidApiKey(extractApiKey(request.headers), expectedKey)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  return new Response(await buildSheet(), {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
  });
}
