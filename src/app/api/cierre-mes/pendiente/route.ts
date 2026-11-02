import type { NextRequest } from "next/server";

import { todayInColombia } from "@/lib/colombia-time";
import { extractApiKey, isValidApiKey } from "@/modules/asesor/presentation/mcp/auth";
import { buildCloseReminder, isLastDayOfMonth } from "@/modules/balances/application/close-month";
import { createPrismaMonthCloseDeps, isMonthClosed } from "@/modules/balances/infrastructure/prisma-month-close";

// Aviso del cierre de mes para quien manda el WhatsApp a Alexander (linea Admin; el envio y el
// reloj viven fuera de Gestion). Solo lectura. Llave Bearer o x-api-key: ALERTAS_API_KEY, si no
// MCP_API_KEY. Sin llave valida: 401. Responde { avisar, mes, ultimo_dia, cerrado, cuentas, mensaje }:
// avisar solo el ultimo dia del mes (hora Colombia) si aun no se cerro; mensaje vacio si no.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const expectedKey = process.env.ALERTAS_API_KEY?.trim() || process.env.MCP_API_KEY;
  if (!isValidApiKey(extractApiKey(request.headers), expectedKey)) {
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-alertas"' } },
    );
  }
  const now = new Date();
  const mes = todayInColombia(now).slice(0, 7);
  const ultimoDia = isLastDayOfMonth(now);
  const [accounts, cerrado] = await Promise.all([createPrismaMonthCloseDeps().loadAccounts(mes), isMonthClosed(mes)]);
  const avisar = ultimoDia && !cerrado && accounts.length > 0;
  return Response.json(
    {
      avisar,
      mes,
      ultimo_dia: ultimoDia,
      cerrado,
      cuentas: accounts.map((account) => account.name),
      mensaje: avisar ? buildCloseReminder(mes, accounts.map((account) => account.name)) : "",
    },
    { headers: NO_STORE },
  );
}
