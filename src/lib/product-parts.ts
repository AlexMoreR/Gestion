// Partes de color de un producto (nov-2026): qué partes llevan color propio (ej. Tapizado, Base) y
// de dónde sale cada uno. Reglas puras; la tabla es ParteColor (categoría = plantilla, producto = propias).
import type { CartaColor, CartaMaterial } from "./carta-colores-crm";

export type ParteColorTipo = "CARTA" | "ACABADOS";

export type ParteColorDatos = {
  nombre: string;
  tipo: ParteColorTipo;
  materiales: string[];
  acabados: string[];
  orden: number;
};

export type OpcionDeParte =
  | { tipo: "CARTA"; material: string; color: CartaColor }
  | { tipo: "ACABADOS"; acabado: string };

const porOrden = <T extends { orden: number }>(partes: T[]): T[] => [...partes].sort((a, b) => a.orden - b.orden);

const clave = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Si el producto tiene partes propias mandan las suyas; si no, la plantilla de la categoría. En orden. */
export function resolverPartes<T extends { orden: number }>(partesCategoria: T[], partesProducto: T[]): T[] {
  return porOrden(partesProducto.length > 0 ? partesProducto : partesCategoria);
}

/** CARTA → colores de la carta del CRM, solo de sus materiales (sin importar tildes ni mayúsculas). ACABADOS → su lista. */
export function opcionesDeParte(
  parte: Pick<ParteColorDatos, "tipo" | "materiales" | "acabados">,
  carta: CartaMaterial[],
): OpcionDeParte[] {
  if (parte.tipo === "ACABADOS") return parte.acabados.map((acabado) => ({ tipo: "ACABADOS", acabado }));
  const materiales = new Set(parte.materiales.map(clave));
  return carta
    .filter((material) => materiales.has(clave(material.nombre)))
    .flatMap((material) => material.colores.map((color) => ({ tipo: "CARTA" as const, material: material.nombre, color })));
}

/** 'Tapizado: Crema · Base: Dorada'; la parte sin color dice 'Por definir'. */
export function textoColores(elegidos: { parte: string; color?: string | null }[]): string {
  return elegidos.map(({ parte, color }) => `${parte}: ${color?.trim() || "Por definir"}`).join(" · ");
}

/** Lista de texto limpia: sin vacíos ni repetidos (sin importar tildes ni mayúsculas). */
export function limpiarLista(valores: string[]): string[] {
  const vistos = new Set<string>();
  return valores
    .map((v) => v.trim())
    .filter((v) => {
      const k = clave(v);
      if (!k || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}
