import "server-only";
import type { ParteElegida } from "@/lib/product-parts";

// IA de respaldo para la vista previa de color (decisión 3, nov-2026): solo el punto de enganche.
// Devuelve null siempre: sin RECOLOR_IA_KEY no hace nada y, aun con ella, todavía no llama a ningún
// servicio (proveedor y costo por definir con Alexander). Al conectarlo, devolver la URL /uploads/... de la imagen.
export async function recolorConIa(entrada: { productId: string; fotoBase: string; partes: ParteElegida[] }): Promise<string | null> {
  void entrada;
  if (!process.env.RECOLOR_IA_KEY?.trim()) return null;
  return null;
}
