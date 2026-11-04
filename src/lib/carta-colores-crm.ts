// Carta de colores del CRM (nov-2026): Gestion no tiene carta propia, lee la del CRM
// (GET /api/gestion/carta-de-colores). Aqui solo reglas puras: limpiar la respuesta y decidir
// entre la memoria, el CRM y la ultima copia guardada. El pedido real esta en carta-colores-crm.server.ts.

export type CartaColor = { codigo: string; nombre: string; fotoUrl: string };
export type CartaMaterial = { nombre: string; colores: CartaColor[] };
export type CartaColores = {
  materiales: CartaMaterial[];
  // "crm" = recien leida; "copia" = el CRM no respondio y se usa la ultima guardada; "nada" = sin carta.
  origen: "crm" | "copia" | "nada";
};

export const CARTA_CACHE_MS = 5 * 60 * 1000;

const texto = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const orden = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function fotoSegura(value: unknown): string {
  const raw = texto(value, 1000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Limpia la respuesta del CRM. Null si no tiene la forma esperada; descarta colores sin codigo o sin nombre. */
export function parseCartaColores(json: unknown): CartaMaterial[] | null {
  const materiales = (json as { materiales?: unknown } | null)?.materiales;
  if (!Array.isArray(materiales)) return null;
  return materiales
    .map((m) => {
      const material = (m ?? {}) as Record<string, unknown>;
      const colores = Array.isArray(material.colores) ? material.colores : [];
      return {
        nombre: texto(material.nombre, 80),
        orden: orden(material.orden),
        colores: colores
          .map((c) => {
            const color = (c ?? {}) as Record<string, unknown>;
            return {
              codigo: texto(color.codigo, 40),
              nombre: texto(color.nombre, 80),
              fotoUrl: fotoSegura(color.fotoUrl),
              orden: orden(color.orden),
            };
          })
          .filter((color) => color.codigo && color.nombre)
          .sort((a, b) => a.orden - b.orden)
          .map(({ codigo, nombre, fotoUrl }) => ({ codigo, nombre, fotoUrl })),
      };
    })
    .filter((material) => material.nombre && material.colores.length > 0)
    .sort((a, b) => a.orden - b.orden)
    .map(({ nombre, colores }) => ({ nombre, colores }));
}

export type CartaDeps = {
  pedirAlCrm: () => Promise<unknown>;
  leerCopia: () => Promise<string | null>;
  guardarCopia: (json: string) => Promise<void>;
  ahora: () => number;
};

type Memoria = { materiales: CartaMaterial[]; en: number } | null;

/**
 * Crea el lector con su memoria de 5 minutos. Cada lectura buena del CRM se guarda como copia;
 * si el CRM falla (o responde algo raro) se usa la memoria vencida o, si no hay, la copia guardada.
 */
export function crearLectorCarta(deps: CartaDeps) {
  let memoria: Memoria = null;
  return async function leerCarta(): Promise<CartaColores> {
    if (memoria && deps.ahora() - memoria.en < CARTA_CACHE_MS) {
      return { materiales: memoria.materiales, origen: "crm" };
    }
    try {
      const materiales = parseCartaColores(await deps.pedirAlCrm());
      if (!materiales) throw new Error("respuesta sin materiales");
      memoria = { materiales, en: deps.ahora() };
      await deps.guardarCopia(JSON.stringify({ materiales })).catch(() => undefined);
      return { materiales, origen: "crm" };
    } catch (error) {
      console.error("Carta de colores: no se pudo leer del CRM.", error instanceof Error ? error.message : error);
    }
    if (memoria) return { materiales: memoria.materiales, origen: "copia" };
    try {
      const raw = await deps.leerCopia();
      const materiales = raw ? parseCartaColores(JSON.parse(raw)) : null;
      if (materiales) return { materiales, origen: "copia" };
    } catch {
      // Copia ilegible: se sigue sin carta.
    }
    return { materiales: [], origen: "nada" };
  };
}
