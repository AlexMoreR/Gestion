// Imports relativos: Vitest no resuelve el alias @/ y route.test.ts importa esta ruta.
import { preciosVigentesUseCase } from "../../../../modules/asesor/application/use-cases";
import { createPrismaAsesorRepository } from "../../../../modules/asesor/infrastructure/prisma-asesor-repository";
import { extractApiKey, isValidApiKey } from "../../../../modules/asesor/presentation/mcp/auth";

// Hoja "Precios vigentes" en Markdown para Claude: productos visibles con precio y COSTO, los mas
// vendidos de 90 dias primero. Solo lectura. Lleva costo: llave MCP_API_KEY (nunca la del catalogo).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!isValidApiKey(extractApiKey(request.headers), process.env.MCP_API_KEY)) {
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-precios"' } },
    );
  }
  const markdown = await preciosVigentesUseCase(createPrismaAsesorRepository());
  return new Response(markdown, { headers: { ...NO_STORE, "Content-Type": "text/markdown; charset=utf-8" } });
}
