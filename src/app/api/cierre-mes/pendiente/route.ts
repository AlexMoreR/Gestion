import type { NextRequest } from "next/server";

import { todayInColombia } from "@/lib/colombia-time";
import { extractApiKey, isValidApiKey } from "@/modules/asesor/presentation/mcp/auth";
import { closeReminderMessage, isLastDayOfMonth, resolveCloseMonth } from "@/modules/balances/application/close-month";
import { loadCloseStatus } from "@/modules/balances/infrastructure/prisma-month-close";

// Aviso de cierre de mes para el CRM (linea Admin, a Alexander). Solo lectura: dice si hoy es el
// ultimo dia del mes en Colombia, que cuentas activas faltan por cerrar y el texto del WhatsApp.
// El envio y el reloj viven en el CRM. Llave Bearer o x-api-key: ALERTAS_API_KEY, si no MCP_API_KEY.
// Responde { avisar, mes, ultimo_dia_del_mes, cerrado, cuentas: [{ cuenta, cerrada }], mensaje }.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const expectedKey = process.env.ALERTAS_API_KEY?.trim() || process.env.MCP_API_KEY;
  if (!isValidApiKey(extractApiKey(request.headers), expectedKey)) {
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="gestion-cierre-mes"' } },
    );
  }
  const today = todayInColombia();
  const monthKey = resolveCloseMonth(undefined, today);
  const status = await loadCloseStatus(monthKey);
  const pending = status.filter((account) => !account.closed).map((account) => account.name);
  const lastDay = isLastDayOfMonth(today);
  const avisar = lastDay && pending.length > 0;
  return Response.json(
    {
      avisar,
      mes: monthKey,
      ultimo_dia_del_mes: lastDay,
      cerrado: pending.length === 0,
      cuentas: status.map((account) => ({ cuenta: account.name, cerrada: account.closed })),
      mensaje: avisar ? closeReminderMessage(monthKey, pending) : "",
    },
    { headers: NO_STORE },
  );
}
