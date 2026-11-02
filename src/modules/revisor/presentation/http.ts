import { extractApiKey, isValidApiKey } from "../../asesor/presentation/mcp/auth";

import type { ResultadoRevisor } from "../infrastructure/prisma-revisor-repository";

// Revisor diario (scripts/revisor en aizen1, 7:00 a. m.): solo lectura. Llave Bearer o x-api-key:
// REVISOR_API_KEY, si no MCP_API_KEY. Sin llave valida: 401. Solo GET (lo demas: 405).
// ?saldosAyer= es el objeto `saldos` que devolvio la corrida anterior ({ idCuenta: pesos }).

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_SALDOS = 10_000;

/** Lee ?saldosAyer=. undefined = vino mal (400); null = no vino. */
export function parseSaldosAyer(raw: string | null): Record<string, number> | null | undefined {
  if (raw === null || raw.trim() === "") return null;
  if (raw.length > MAX_SALDOS) return undefined;
  try {
    const valor: unknown = JSON.parse(raw);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
    const saldos: Record<string, number> = {};
    for (const [id, monto] of Object.entries(valor)) {
      if (typeof monto !== "number" || !Number.isFinite(monto)) return undefined;
      saldos[id] = monto;
    }
    return saldos;
  } catch {
    return undefined;
  }
}

export async function handleRevisorRequest(
  request: Request,
  revisar: (saldosAyer: Record<string, number> | null) => Promise<ResultadoRevisor>,
): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ error: "Método no permitido" }, { status: 405, headers: { ...NO_STORE, Allow: "GET" } });
  }
  const expectedKey = process.env.REVISOR_API_KEY?.trim() || process.env.MCP_API_KEY;
  if (!isValidApiKey(extractApiKey(request.headers), expectedKey)) {
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-revisor"' } },
    );
  }
  const saldosAyer = parseSaldosAyer(new URL(request.url).searchParams.get("saldosAyer"));
  if (saldosAyer === undefined) {
    return Response.json({ error: "saldosAyer debe ser un objeto JSON { idCuenta: número }" }, { status: 400, headers: NO_STORE });
  }
  return Response.json(await revisar(saldosAyer), { headers: NO_STORE });
}
