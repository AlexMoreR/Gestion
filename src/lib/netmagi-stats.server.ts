import "server-only";
import { getNetmagiConfig } from "@/lib/netmagi-config.server";
import {
  type BogotaRange,
  type NetmagiStats,
  parseAnuncios,
  parseCuentas,
  parseProductos,
  parsePublicador,
  parseResumen,
} from "@/modules/marketplace/domain/marketplace-stats";

export type { NetmagiStats };

// Estadisticas de NETMAGI para /admin/marketplace. SOLO LECTURA y solo agregados (NETMAGI nunca manda
// nombres de clientes, textos ni telefonos). Las 5 rutas se piden UNA TRAS OTRA: el Postgres de NETMAGI
// tiene un pool de 5 conexiones compartido con las extensiones. NETMAGI guarda cada respuesta 5 min
// (1 min la de cuentas, que trae el estado en vivo).
//
// Compatibilidad: NETMAGI y Gestion se despliegan por separado. La ruta /anuncios es nueva: si NETMAGI
// todavia no la tiene (404) la pagina sigue funcionando sin la tabla de anuncios (anunciosFaltan = true).

const TIMEOUT_MS = 20_000;

class NetmagiUnavailable extends Error {}
class NetmagiRouteMissing extends Error {}

async function getJson(baseUrl: string, key: string, path: string, optional = false): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new NetmagiUnavailable(controller.signal.aborted ? "NETMAGI no respondió a tiempo" : "No se pudo conectar con NETMAGI");
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) throw new NetmagiUnavailable("NETMAGI rechazó la llave (revisa GESTION_FOTOS_KEY en los dos servicios)");
  if (response.status === 503) throw new NetmagiUnavailable("NETMAGI no tiene configurada GESTION_FOTOS_KEY");
  if (response.status === 404 && optional) throw new NetmagiRouteMissing();
  if (response.status === 404) throw new NetmagiUnavailable("NETMAGI todavía no tiene las rutas de estadísticas (falta desplegar)");
  if (!response.ok) throw new Error(`NETMAGI respondió HTTP ${response.status}`);
  return response.json();
}

export async function getNetmagiStats(range: Pick<BogotaRange, "desde" | "hasta">): Promise<NetmagiStats> {
  const empty: NetmagiStats = { ok: false, error: null, resumen: null, cuentas: null, productos: null, publicador: null, anuncios: null, anunciosFaltan: false };
  const config = getNetmagiConfig();
  if (!config) return { ...empty, error: "Falta configurar NETMAGI (NETMAGI_FOTOS_URL y GESTION_FOTOS_KEY)" };

  const query = `?desde=${encodeURIComponent(range.desde)}&hasta=${encodeURIComponent(range.hasta)}`;
  const result: NetmagiStats = { ...empty };
  const errors: string[] = [];
  const steps = [
    ["resumen", parseResumen, false],
    ["cuentas", parseCuentas, false],
    ["productos", parseProductos, false],
    ["publicador", parsePublicador, false],
    ["anuncios", parseAnuncios, true],
  ] as const;

  for (const [name, parse, optional] of steps) {
    try {
      const parsed = parse(await getJson(config.baseUrl, config.key, `/gestion/estadisticas/${name}${query}`, optional));
      if (parsed == null) errors.push(`${name}: respuesta inválida`);
      // Asignacion por nombre: cada parse devuelve el tipo de su llave.
      (result as Record<string, unknown>)[name] = parsed;
    } catch (error) {
      if (error instanceof NetmagiRouteMissing) {
        result.anunciosFaltan = true;
        continue;
      }
      // Si NETMAGI no esta (caido, sin llave, sin desplegar), no se insiste con las demas rutas.
      if (error instanceof NetmagiUnavailable) return { ...empty, error: error.message };
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  result.ok = result.resumen != null;
  result.error = errors.length ? errors.join(" · ") : null;
  return result;
}
