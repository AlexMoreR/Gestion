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

/** Recargo opcional por opción, solo para avisar (nunca suma al precio). Llave = material o acabado. */
export type RecargosParte = { materiales?: Record<string, number>; acabados?: Record<string, number> };

/** Lo que el editor de cotización necesita de cada parte (ya resuelta: propia o de la categoría). */
export type ParteParaCotizar = {
  nombre: string;
  tipo: ParteColorTipo;
  materiales: string[];
  acabados: string[];
  recargos: RecargosParte;
  coloresComunes: string[];
};

/** Color elegido de una parte, como se guarda en las notas de la línea. color "" = Por definir. */
export type ParteElegida = {
  parte: string;
  color: string;
  colorCodigo: string;
  colorMaterial: string;
  colorFotoUrl: string;
  hex: string;
};

export const POR_DEFINIR = "Por definir";

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
/** Los colores comunes (por código o nombre) van primero, en el orden escrito; el resto queda como estaba. */
export function opcionesDeParte(
  parte: Pick<ParteColorDatos, "tipo" | "materiales" | "acabados"> & { coloresComunes?: string[] },
  carta: CartaMaterial[],
): OpcionDeParte[] {
  if (parte.tipo === "ACABADOS") return parte.acabados.map((acabado) => ({ tipo: "ACABADOS", acabado }));
  const materiales = new Set(parte.materiales.map(clave));
  const opciones = carta
    .filter((material) => materiales.has(clave(material.nombre)))
    .flatMap((material) => material.colores.map((color) => ({ tipo: "CARTA" as const, material: material.nombre, color })));
  const comunes = (parte.coloresComunes ?? []).map(clave).filter(Boolean);
  if (comunes.length === 0) return opciones;
  const puesto = (opcion: (typeof opciones)[number]) => {
    const i = comunes.findIndex((c) => c === clave(opcion.color.codigo) || c === clave(opcion.color.nombre));
    return i < 0 ? comunes.length : i;
  };
  // sort es estable: a igual puesto se conserva el orden de la carta.
  return [...opciones].sort((a, b) => puesto(a) - puesto(b));
}

/** Recargo de lo elegido en una parte (por material o por acabado): [opción, pesos] o null. */
export function recargoDe(
  parte: Pick<ParteParaCotizar, "tipo" | "recargos">,
  elegido: Pick<ParteElegida, "color" | "colorMaterial">,
): [string, number] | null {
  const tabla = parte.tipo === "CARTA" ? parte.recargos.materiales : parte.recargos.acabados;
  const buscado = clave(parte.tipo === "CARTA" ? elegido.colorMaterial : elegido.color);
  if (!tabla || !buscado) return null;
  const fila = Object.entries(tabla).find(([llave]) => clave(llave) === buscado);
  // La opción se nombra como se escribió en la tarjeta (ej. "Prana").
  return fila && Number.isFinite(fila[1]) && fila[1] > 0 ? fila : null;
}

/** "Prana: +$150.000 — ajusta el precio a mano" por cada opción elegida con recargo. Solo aviso. */
export function avisosDeRecargo(
  partes: Pick<ParteParaCotizar, "nombre" | "tipo" | "recargos">[],
  elegidos: Pick<ParteElegida, "parte" | "color" | "colorMaterial">[],
): string[] {
  return partes.flatMap((parte) => {
    const elegido = elegidos.find((e) => clave(e.parte) === clave(parte.nombre));
    const recargo = elegido && elegido.color.trim() ? recargoDe(parte, elegido) : null;
    if (!recargo) return [];
    return [`${recargo[0]}: +$${new Intl.NumberFormat("es-CO").format(recargo[1])} — ajusta el precio a mano`];
  });
}

/** Una línea a revisar antes de pasar a venta: sus partes (leídas de la base) y lo que se eligió. */
export type LineaColores = { etiqueta: string; requeridas: string[]; elegidos: Pick<ParteElegida, "parte" | "color">[] };

/** "CMB005 – Tapizado" por cada parte sin color o en Por definir (sin repetir: un combo son varias líneas). */
export function faltanColores(lineas: LineaColores[]): string[] {
  const faltan = new Set<string>();
  for (const linea of lineas) {
    for (const parte of linea.requeridas) {
      const color = linea.elegidos.find((e) => clave(e.parte) === clave(parte))?.color ?? "";
      if (!clave(color) || clave(color) === clave(POR_DEFINIR)) faltan.add(`${linea.etiqueta} – ${parte}`);
    }
  }
  return [...faltan];
}

/** 'Tapizado: Crema · Base: Dorada'; la parte sin color dice 'Por definir'. */
export function textoColores(elegidos: { parte: string; color?: string | null }[]): string {
  return elegidos.map(({ parte, color }) => `${parte}: ${color?.trim() || POR_DEFINIR}`).join(" · ");
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

const tablaDeRecargos = (valor: unknown): Record<string, number> | undefined => {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  const filas = Object.entries(valor as Record<string, unknown>).filter(
    (fila): fila is [string, number] => typeof fila[1] === "number" && Number.isFinite(fila[1]) && fila[1] > 0,
  );
  return filas.length > 0 ? Object.fromEntries(filas) : undefined;
};

/** Lee ParteColor.recargos (Json) sin fallar con datos viejos o mal formados. */
export function leerRecargos(json: unknown): RecargosParte {
  const raw = (json ?? {}) as { materiales?: unknown; acabados?: unknown };
  const materiales = tablaDeRecargos(raw.materiales);
  const acabados = tablaDeRecargos(raw.acabados);
  return { ...(materiales ? { materiales } : {}), ...(acabados ? { acabados } : {}) };
}

// ── Color exacto de los acabados (nov-2026) ───────────────────────────────────────────────────────
const HEX_RGB = /^#[0-9a-f]{6}$/i;

/** Color de fábrica de los acabados más comunes, si la parte no tiene uno guardado. Llave sin tildes ni mayúsculas. */
export const ACABADOS_HEX_DEFECTO: Record<string, string> = {
  blanco: "#F2F2F2",
  blanca: "#F2F2F2",
  negro: "#1C1C1C",
  negra: "#1C1C1C",
  dorado: "#C9A24A",
  dorada: "#C9A24A",
  "cromado dorado": "#D4B26A",
  "cromada dorada": "#D4B26A",
  cromado: "#C0C0C0",
  cromada: "#C0C0C0",
};

export const esHex = (valor: unknown): valor is string => typeof valor === "string" && HEX_RGB.test(valor.trim());

/** Lee ParteColor.acabadosHex (Json) sin fallar: solo pares acabado → #RRGGBB válidos, en mayúsculas. */
export function leerAcabadosHex(json: unknown): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return Object.fromEntries(
    Object.entries(json as Record<string, unknown>)
      .filter((fila): fila is [string, string] => Boolean(fila[0].trim()) && esHex(fila[1]))
      .map(([acabado, hex]) => [acabado.trim(), hex.trim().toUpperCase()]),
  );
}

/** Hex de un acabado: el guardado en la parte; si no, el de fábrica; si tampoco, null (sin vista previa). */
export function hexDeAcabado(acabado: string, acabadosHex: Record<string, string>): string | null {
  const buscado = clave(acabado);
  if (!buscado) return null;
  const guardado = Object.entries(acabadosHex).find(([llave]) => clave(llave) === buscado)?.[1];
  return guardado ?? ACABADOS_HEX_DEFECTO[buscado] ?? null;
}

/** Parte de la base con lo que hace falta para pintar la foto. */
export type ParteParaPintar = Pick<ParteColorDatos, "nombre" | "tipo"> & { mascaraUrl: string | null; acabadosHex: unknown };

/** Lo que recibe recolorear por cada parte (misma forma que ParteARecolorear). */
export type PartePintada = { mascara: string; hex: string | null; texturaUrl: string | null };

/**
 * Lista para recolorear, en el orden de las partes de la base. Acabados: el hex sale siempre de la base
 * (o del de fábrica), nunca del navegador. Carta: el hex de la carta; si no trae, la foto de la muestra.
 * null si a una parte le falta máscara o color, o está en Por definir.
 */
export function partesParaRecolorear(
  partes: ParteParaPintar[],
  elegidos: Pick<ParteElegida, "parte" | "color" | "colorFotoUrl" | "hex">[],
): PartePintada[] | null {
  if (partes.length === 0) return null;
  const lista: PartePintada[] = [];
  for (const parte of partes) {
    const elegido = elegidos.find((e) => clave(e.parte) === clave(parte.nombre));
    const color = elegido?.color.trim() ?? "";
    if (!elegido || !color || clave(color) === clave(POR_DEFINIR) || !parte.mascaraUrl) return null;
    if (parte.tipo === "ACABADOS") {
      const hex = hexDeAcabado(color, leerAcabadosHex(parte.acabadosHex));
      if (!hex) return null;
      lista.push({ mascara: parte.mascaraUrl, hex, texturaUrl: null });
    } else if (esHex(elegido.hex)) {
      lista.push({ mascara: parte.mascaraUrl, hex: elegido.hex.trim(), texturaUrl: null });
    } else if (elegido.colorFotoUrl.trim()) {
      lista.push({ mascara: parte.mascaraUrl, hex: null, texturaUrl: elegido.colorFotoUrl.trim() });
    } else {
      return null;
    }
  }
  return lista;
}
