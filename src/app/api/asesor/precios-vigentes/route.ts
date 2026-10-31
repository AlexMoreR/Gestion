import { preciosVigentesUseCase } from "@/modules/asesor/application/use-cases";
import { createPrismaAsesorRepository } from "@/modules/asesor/infrastructure/prisma-asesor-repository";
import { handlePreciosVigentes } from "@/modules/asesor/presentation/precios-vigentes-http";

// Hoja "Precios vigentes" en Markdown para el cerebro de Claude: productos visibles con precio y COSTO,
// los mas vendidos de 90 dias primero. Solo lectura. Llave MCP_API_KEY ("Authorization: Bearer" o
// "x-api-key"); NO la del catalogo, porque lleva costo. Sin llave valida: 401.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handlePreciosVigentes(request, process.env.MCP_API_KEY, () =>
    preciosVigentesUseCase(createPrismaAsesorRepository(), new Date()),
  );
}
