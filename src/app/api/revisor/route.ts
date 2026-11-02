import { revisarGestion } from "@/modules/revisor/infrastructure/prisma-revisor-repository";
import { handleRevisorRequest } from "@/modules/revisor/presentation/http";

// Revisor diario de las 7 a. m. (solo lectura). Ver src/modules/revisor/presentation/http.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = (request: Request) => handleRevisorRequest(request, revisarGestion);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
