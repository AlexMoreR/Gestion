import "server-only";

// Conexion con NETMAGI (crm-api). La usan "Traer de Drive" (/gestion/fotos) y el panel
// /admin/marketplace (/gestion/estadisticas/*). Misma llave en los dos servicios: GESTION_FOTOS_KEY.

export type NetmagiConfig = { baseUrl: string; key: string };

export function getNetmagiConfig(): NetmagiConfig | null {
  const baseUrl = (process.env.NETMAGI_FOTOS_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.GESTION_FOTOS_KEY ?? "").trim();
  if (!baseUrl || !key) return null;
  return { baseUrl, key };
}
