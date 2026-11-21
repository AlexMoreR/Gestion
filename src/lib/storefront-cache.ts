import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";

// Caché de datos de la tienda pública (inicio, categorías, fichas y ajustes que salen en ella).
export const TIENDA_CACHE_TAG = "tienda";
export const TIENDA_CACHE_SEGUNDOS = 300;

// Guarda el resultado 5 minutos con la etiqueta "tienda". Ojo: se guarda como JSON, así que los
// Decimal y las fechas vuelven como texto (las reglas de precio y oferta ya aceptan texto).
export function enCacheDeTienda<A extends unknown[], R>(fn: (...args: A) => Promise<R>, llave: string) {
  const enCache = unstable_cache(fn, [llave], { revalidate: TIENDA_CACHE_SEGUNDOS, tags: [TIENDA_CACHE_TAG] });
  return async (...args: A): Promise<R> => {
    try {
      return await enCache(...args);
    } catch (error) {
      // shortcut: se reconoce por el texto del error de Next; si Next lo cambia, revisar esta línea.
      // Fuera de Next (scripts, pruebas) no hay caché: se lee directo de la base.
      if (error instanceof Error && error.message.includes("incrementalCache missing")) {
        return fn(...args);
      }
      throw error;
    }
  };
}

// Llamar después de cualquier cambio que se vea en la tienda: borra páginas y datos guardados.
export function refrescarTienda(): void {
  revalidatePath("/", "layout");
  revalidateTag(TIENDA_CACHE_TAG, { expire: 0 });
}
