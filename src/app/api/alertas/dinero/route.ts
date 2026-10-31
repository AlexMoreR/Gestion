import type { NextRequest } from "next/server";

import { extractApiKey, isValidApiKey } from "@/modules/asesor/presentation/mcp/auth";
import { buildMoneyAlert } from "@/modules/balances/domain/money-alert";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { listUnaccountedSince } from "@/modules/balances/infrastructure/prisma-money-alert";
import { getMoneyWithoutAccount } from "@/modules/balances/infrastructure/prisma-money-without-account";
import { getCashPositionUseCase } from "@/modules/nomina/application/use-cases";

// Aviso diario de dinero para el script de aizen1 (scripts/alertas): cuentas en negativo y lo
// guardado sin cuenta en las ultimas 24 h. Solo lectura. Llave Bearer o x-api-key: ALERTAS_API_KEY,
// si no MCP_API_KEY. Sin llave valida: 401. Responde { avisar, mensaje } (mensaje vacio si todo bien).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const expectedKey = process.env.ALERTAS_API_KEY?.trim() || process.env.MCP_API_KEY;
  if (!isValidApiKey(extractApiKey(request.headers), expectedKey)) {
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-alertas"' } },
    );
  }
  const [position, unaccounted] = await Promise.all([
    getCashPositionUseCase(createPrismaBalancesRepository(), getMoneyWithoutAccount),
    listUnaccountedSince(new Date(Date.now() - DAY_MS)),
  ]);
  return Response.json(buildMoneyAlert(position.accounts, unaccounted), { headers: NO_STORE });
}
