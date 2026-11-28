import { expandComboLines, type ComboComponent } from "./combo";
import type { LineaColores } from "./product-parts";
import { lineasSinColor, parseQuoteItemMeta } from "./quote-item-meta";

// Cotización con venta (nov-2026): se puede agregar, quitar o cambiar productos; lo quitado se cancela en la orden.
export const COTIZACION_CON_VENTA_LINEAS =
  "Esta cotización ya tiene venta: puedes agregar, quitar o cambiar productos. Lo abonado no se toca: el total y el saldo se recalculan al guardar. Si quitas o cambias algo, escribe el motivo.";

// «Cambiar producto»: los demás productos de la venta quedan como estaban.
export const CAMBIO_SOLO_AGREGA =
  "En «Cambiar producto» los demás productos no se tocan: solo agrega el producto nuevo.";

type Linea = {
  productId: string;
  supplierId?: string | null;
  quantity: number;
  unitPrice: number | { toString(): string };
  fulfillmentMode: string;
  notes?: string | null;
};

/**
 * Las notas sin la imagen con colores (es derivada, se rehace sola) ni la lista de adicionales (la escribe
 * «Agregar adicional» en la orden y el editor no la manda; su precio sí cuenta, va en additionalCost).
 */
function notasSinImagen(notes: string | null | undefined): string | null {
  if (!notes) return notes ?? null;
  try {
    const meta = JSON.parse(notes) as Record<string, unknown>;
    if (meta && typeof meta === "object" && ("imagenColoresUrl" in meta || "adicionales" in meta)) {
      delete meta.imagenColoresUrl;
      delete meta.adicionales;
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

/**
 * Cotización con venta: las líneas que ya tenía quedan iguales y solo se pueden sumar otras.
 * Devuelve las nuevas (las que sobran después de emparejar cada línea vieja con una igual) o
 * null si alguna línea vieja cambió o se quitó.
 */
export function lineasAgregadas<T extends Linea>(existentes: Linea[], nuevas: T[]): T[] | null {
  const pendientes = nuevas.map((linea) => ({ linea, clave: clave(linea), usada: false }));
  for (const vieja of existentes) {
    const k = clave(vieja);
    const par = pendientes.find((p) => !p.usada && p.clave === k);
    if (!par) return null;
    par.usada = true;
  }
  return pendientes.filter((p) => !p.usada).map((p) => p.linea);
}

/**
 * Cotización con venta: qué líneas se agregan y cuáles se quitan al guardar. Cada vieja se empareja con una
 * nueva igual; la que no tiene par se quita y la nueva que sobra se agrega (cambiar una línea = quitarla y
 * agregar la nueva). Un combo va entero: si cambia una pieza se quitan todas sus piezas viejas y se agregan
 * todas las nuevas, porque «Cancelar producto» cancela el combo completo.
 */
export function cambiosDeLineas<V extends Linea, T extends Linea>(
  existentes: V[],
  nuevas: T[],
): { agregadas: T[]; quitadas: V[] } {
  const pendientes = nuevas.map((linea) => ({ linea, clave: clave(linea), usada: false }));
  const sinPar = new Set<V>();
  for (const vieja of existentes) {
    const k = clave(vieja);
    const par = pendientes.find((p) => !p.usada && p.clave === k);
    if (par) par.usada = true;
    else sinPar.add(vieja);
  }
  const comboDe = (linea: Linea) => parseQuoteItemMeta(linea.notes ?? null).comboKey;
  const combosTocados = new Set(
    [...sinPar, ...pendientes.filter((p) => !p.usada).map((p) => p.linea)].map(comboDe).filter(Boolean),
  );
  return {
    agregadas: pendientes.filter((p) => !p.usada || combosTocados.has(comboDe(p.linea))).map((p) => p.linea),
    quitadas: existentes.filter((vieja) => sinPar.has(vieja) || combosTocados.has(comboDe(vieja))),
  };
}

// Reparte un monto (descuento o costo adicional del combo) entre las lineas en
// proporcion a su peso. El ultimo elemento absorbe el redondeo para que la suma
// sea exacta. Asi ninguna linea concentra todo el descuento (evita el recorte a
// 0) y el desglose Subtotal/Descuento/Adicional cuadra con el Total.
export function distributeAmount(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  let allocated = 0;
  return weights.map((w, index) => {
    if (index === weights.length - 1) {
      return Math.round(amount - allocated);
    }
    const part =
      totalWeight > 0
        ? Math.round((amount * Math.max(0, w)) / totalWeight)
        : Math.round(amount / weights.length);
    allocated += part;
    return part;
  });
}

// --- Editar un combo ya agregado (una fila = varias lineas con el mismo comboKey) ---

type LineaCombo = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  additionalCost: number;
  comboQuantity: number;
};

export type ValoresCombo = { quantity: number; unitPrice: number; discount: number; additionalCost: number };

const redondear2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Lo que muestra la fila del combo: cantidad de combos, precio por combo (sin adicional ni descuento) y sumas. */
export function resumenCombo(lineas: LineaCombo[]): ValoresCombo {
  const quantity = lineas[0]?.comboQuantity || 1;
  const bruto = lineas.reduce((sum, linea) => sum + linea.quantity * linea.unitPrice, 0);
  return {
    quantity,
    unitPrice: redondear2(bruto / quantity),
    discount: redondear2(lineas.reduce((sum, linea) => sum + linea.discount, 0)),
    additionalCost: redondear2(lineas.reduce((sum, linea) => sum + linea.additionalCost, 0)),
  };
}

/**
 * Aplica la edicion a las lineas de un combo sin cambiar sus piezas (alternas incluidas):
 * cada linea queda en su posicion y conserva el resto de sus campos. Solo reparte lo que cambio,
 * para no mover centavos de una fila que se abrio y se guardo igual.
 */
export function aplicarEdicionCombo<T extends LineaCombo>(lineas: T[], valores: ValoresCombo): T[] {
  const antes = resumenCombo(lineas);
  let nuevas = lineas.map((linea) => ({ ...linea }));

  if (valores.quantity !== antes.quantity || valores.unitPrice !== antes.unitPrice) {
    // Las piezas actuales hacen de componentes: el peso de cada una es lo que vale hoy en el combo.
    const componentes: ComboComponent[] = lineas.map((linea) => ({
      productId: linea.productId,
      name: "",
      code: null,
      quantity: linea.quantity / antes.quantity,
      retailPrice: linea.unitPrice,
    }));
    const expandidas = expandComboLines(componentes, valores.quantity, valores.unitPrice);
    // expandComboLines descarta piezas con cantidad 0; si pasara, no se puede empatar por posicion.
    if (expandidas.length !== lineas.length) return lineas;
    nuevas = nuevas.map((linea, index) => ({
      ...linea,
      quantity: expandidas[index].quantity,
      unitPrice: expandidas[index].unitPrice,
      comboQuantity: valores.quantity,
    }));
  }

  const pesos = nuevas.map((linea) => linea.quantity * linea.unitPrice);
  if (valores.discount !== antes.discount) {
    const partes = distributeAmount(valores.discount, pesos);
    nuevas = nuevas.map((linea, index) => ({ ...linea, discount: Math.max(0, partes[index] ?? 0) }));
  }
  if (valores.additionalCost !== antes.additionalCost) {
    const partes = distributeAmount(valores.additionalCost, pesos);
    nuevas = nuevas.map((linea, index) => ({ ...linea, additionalCost: Math.max(0, partes[index] ?? 0) }));
  }

  return nuevas;
}

// --- Lo que el servidor revisa antes de guardar la edicion (la pantalla ya lo frena; aqui no se salta) ---

export type LineaAGuardar = LineaColores & {
  combo: boolean;
  color: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  additionalCost: number;
  comboKey?: string | null;
};

const enPesos = (valor: number) => `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(valor)}`;

/**
 * Error de los valores al guardar, o null. Primero el color (misma regla y texto de la pantalla).
 * Luego el descuento: no pasa de cantidad × precio + adicional, por línea suelta y, en un combo,
 * sumando sus líneas (el reparto redondeado puede dejar una pieza con unos pesos de más).
 * Menos de 1 peso de diferencia no cuenta.
 */
export function errorAlGuardarLineas(lineas: LineaAGuardar[]): string | null {
  const faltan = lineasSinColor(lineas);
  if (faltan.length > 0) return `Falta escoger el color: ${faltan.join(", ")}`;

  const grupos = new Map<string, LineaAGuardar[]>();
  lineas.forEach((linea, index) => {
    const clave = linea.comboKey ? `combo:${linea.comboKey}` : `linea:${index}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), linea]);
  });
  for (const grupo of grupos.values()) {
    const valor = grupo.reduce((sum, l) => sum + l.quantity * l.unitPrice + l.additionalCost, 0);
    const descuento = grupo.reduce((sum, l) => sum + l.discount, 0);
    if (descuento - valor >= 1) {
      return `El descuento de ${grupo[0].etiqueta} (${enPesos(descuento)}) no puede pasar de su valor (${enPesos(valor)}).`;
    }
  }
  return null;
}
