import { extractApiKey, isValidApiKey } from "../../asesor/presentation/mcp/auth";
import { GRUPOS_DUDAS, type Duda, type Respuesta } from "../domain/duda";
import { respuestasParaApi } from "../application/reportes";

// GET /api/dudas/respuestas: respuestas de "Dudas del catalogo" para Claude. Solo lectura.
// Llave en "Authorization: Bearer" o "x-api-key": DUDAS_API_KEY; si no existe, CATALOGO_API_KEY;
// si no, MCP_API_KEY. Filtros: ?estado=respondidas|pendientes|todas (def. todas), ?grupo=, ?historial=1.

const NO_STORE = { "Cache-Control": "no-store" };

export type RespuestasDeps = {
  expectedKey: string | undefined;
  listarDudas: () => Promise<Duda[]>;
  listarRespuestas: () => Promise<Respuesta[]>;
  ahora?: () => Date;
};

export function llaveDeDudas(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.DUDAS_API_KEY?.trim() || env.CATALOGO_API_KEY?.trim() || env.MCP_API_KEY;
}

export async function handleRespuestasDudas(request: Request, deps: RespuestasDeps): Promise<Response> {
  if (!isValidApiKey(extractApiKey(request.headers), deps.expectedKey)) {
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-dudas"' } },
    );
  }
  const params = new URL(request.url).searchParams;
  const estado = params.get("estado") ?? "todas";
  if (!["todas", "pendientes", "respondidas"].includes(estado)) {
    return Response.json({ error: "estado debe ser todas, pendientes o respondidas" }, { status: 400, headers: NO_STORE });
  }
  const grupo = params.get("grupo")?.trim() || undefined;
  if (grupo && !(GRUPOS_DUDAS as readonly string[]).includes(grupo)) {
    return Response.json({ error: `grupo debe ser uno de: ${GRUPOS_DUDAS.join(", ")}` }, { status: 400, headers: NO_STORE });
  }
  const [dudas, respuestas] = await Promise.all([deps.listarDudas(), deps.listarRespuestas()]);
  const cuerpo = respuestasParaApi(dudas, respuestas, {
    estado: estado as "todas" | "pendientes" | "respondidas",
    grupo,
    historial: params.get("historial") === "1",
  });
  return Response.json({ generado_el: (deps.ahora?.() ?? new Date()).toISOString(), ...cuerpo }, { headers: NO_STORE });
}
