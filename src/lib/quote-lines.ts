// Una cotización con venta no puede cambiar sus líneas: antes se borraban y se rehacían.
export const COTIZACION_CON_VENTA_LINEAS =
  "Esta cotización ya tiene venta: sus productos no se pueden cambiar. Puedes editar las notas y el estado.";

type Linea = {
  productId: string;
  supplierId?: string | null;
  quantity: number;
  unitPrice: number | { toString(): string };
  fulfillmentMode: string;
  notes?: string | null;
};

/** Las notas sin la imagen con colores: es derivada (se rehace sola), no un cambio de la línea. */
function notasSinImagen(notes: string | null | undefined): string | null {
  if (!notes) return notes ?? null;
  try {
    const meta = JSON.parse(notes) as Record<string, unknown>;
    if (meta && typeof meta === "object" && "imagenColoresUrl" in meta) {
      delete meta.imagenColoresUrl;
      return JSON.stringify(meta);
    }
  } catch {
    // Nota de texto plano.
  }
  return notes;
}

const clave = (linea: Linea) =>
  JSON.stringify([
    linea.productId,
    linea.supplierId ?? null,
    linea.quantity,
    Number(linea.unitPrice),
    linea.fulfillmentMode,
    notasSinImagen(linea.notes),
  ]);

/** ¿Las dos listas tienen las mismas líneas (sin importar el orden)? */
export function mismasLineas(a: Linea[], b: Linea[]): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(clave).sort();
  const kb = b.map(clave).sort();
  return ka.every((k, i) => k === kb[i]);
}
