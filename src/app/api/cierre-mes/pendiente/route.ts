import { prisma } from "@/lib/prisma";
import {
  esUltimoDiaDelMes,
  marcaCierre,
  mensajeAvisoCierre,
  mesEnCursoBogota,
} from "@/modules/balances/application/close-month";
import { extractApiKey, isValidApiKey } from "@/modules/asesor/presentation/mcp/auth";

// Aviso del cierre de mes para el CRM (solo lectura): si hoy es el ultimo dia del mes en Colombia,
// el texto que se le manda a Alexander por la linea Admin y si el mes ya se cerro (cerrar_mes del
// MCP). Nunca da saldos. Llave Bearer: CIERRE_MES_API_KEY, si no CATALOGO_API_KEY, si no MCP_API_KEY.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const expected =
    process.env.CIERRE_MES_API_KEY?.trim() || process.env.CATALOGO_API_KEY?.trim() || process.env.MCP_API_KEY;
  if (!isValidApiKey(extractApiKey(request.headers), expected)) {
    return Response.json({ error: "No autorizado" }, { status: 401, headers: NO_STORE });
  }

  const now = new Date();
  const mes = mesEnCursoBogota(now);
  const [cuentas, cierre] = await Promise.all([
    prisma.account.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
    prisma.activityLog.findFirst({ where: { entityType: "ACCOUNT", entityId: marcaCierre(mes) }, select: { id: true } }),
  ]);
  const nombres = cuentas.map((cuenta) => cuenta.name);
  const yaCerrado = Boolean(cierre);
  const ultimoDia = esUltimoDiaDelMes(now);

  return Response.json(
    {
      mes,
      ultimo_dia: ultimoDia,
      ya_cerrado: yaCerrado,
      enviar: ultimoDia && !yaCerrado && nombres.length > 0,
      destino: "Alexander, linea Admin",
      cuentas: nombres,
      mensaje: mensajeAvisoCierre(mes, nombres),
    },
    { headers: NO_STORE },
  );
}
