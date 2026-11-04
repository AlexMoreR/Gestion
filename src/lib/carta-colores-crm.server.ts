import "server-only";
import { crearLectorCarta } from "@/lib/carta-colores-crm";
import { getAppSettingValue, setAppSettingValue } from "@/lib/system-settings";

const CARTA_URL_POR_DEFECTO = "https://crm.magilus.com/api/gestion/carta-de-colores";
const COPIA_KEY = "cartaColoresCrm";

// La misma llave de la conexion CRM↔Gestion que usa el recibo de caja.
function llave(): string | null {
  return process.env.CRM_API_KEY?.trim() || process.env.CATALOGO_API_KEY?.trim() || process.env.MCP_API_KEY?.trim() || null;
}

async function pedirAlCrm(): Promise<unknown> {
  const key = llave();
  if (!key) throw new Error("falta la llave CRM_API_KEY (o CATALOGO_API_KEY / MCP_API_KEY)");
  const res = await fetch(process.env.CRM_CARTA_COLORES_URL?.trim() || CARTA_URL_POR_DEFECTO, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`el CRM respondio ${res.status}`);
  return res.json();
}

// Una memoria por proceso (5 min); la copia en AppSetting sobrevive a los reinicios.
export const leerCartaColores = crearLectorCarta({
  pedirAlCrm,
  leerCopia: () => getAppSettingValue(COPIA_KEY),
  guardarCopia: (json) => setAppSettingValue(COPIA_KEY, json),
  ahora: () => Date.now(),
});
