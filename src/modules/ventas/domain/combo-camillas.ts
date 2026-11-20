// Reglas puras del Combo Camillas: cuando una venta trae el combo, su orden se
// crea sola y el item se confirma con la proveedora Laura al costo pactado.
// Aqui solo se decide QUE hacer; nunca se adivina: si falta un dato o hay duda,
// la respuesta es una alerta para que una persona lo resuelva.
// Imports relativos a src/lib porque Vitest no resuelve el alias "@/".
import { roundMoney } from "../../../lib/pricing";
import { normalizeProductCode } from "../../../lib/product-code";
import { parseQuoteItemMeta } from "../../../lib/quote-item-meta";

export const COMBO_CAMILLAS_CODES = ["CMB005", "CAV-16"] as const;

// Inicio del resumen del ActivityLog cuando la orden se crea sola (app y script de relleno).
export const ORDEN_COMBO_CREADA_SOLA = "Orden creada sola (Combo Camillas)";

export type ComboItem = { codigo: string | null | undefined; cantidad: number };
export type Proveedora = { id: string; name: string };

export type ComboAlertaMotivo = "falta_producto" | "falta_proveedora" | "proveedora_ambigua" | "falta_costo";

export type ComboPlan =
  | { accion: "crear"; supplierId: string; unitCost: number; combos: number }
  | { accion: "nada" }
  | { accion: "alerta"; motivo: ComboAlertaMotivo };

const COMBO_CODES = new Set<string>(COMBO_CAMILLAS_CODES);

export function esComboCamillas(item: { codigo: string | null | undefined }): boolean {
  return COMBO_CODES.has(normalizeProductCode(item.codigo));
}

function nombreSinTildes(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// "Laura" como palabra completa (ej. "Laura", "Fabrica Laura"), no "Laurita".
export function esLaura(proveedora: Proveedora): boolean {
  return /\blaura\b/.test(nombreSinTildes(proveedora.name));
}

// unitCost es el costo POR COMBO (ej. 600.000); combos = cuantos combos trae la venta.
export function planComboOrder(input: {
  items: ComboItem[];
  proveedoras: Proveedora[];
  costo: number | null | undefined;
  yaTieneOrden: boolean;
}): ComboPlan {
  if (input.yaTieneOrden) return { accion: "nada" };
  if (input.items.length === 0) return { accion: "alerta", motivo: "falta_producto" };

  const combos = input.items.filter(esComboCamillas).reduce((sum, item) => sum + item.cantidad, 0);
  if (combos <= 0) return { accion: "nada" };

  const lauras = input.proveedoras.filter(esLaura);
  if (lauras.length === 0) return { accion: "alerta", motivo: "falta_proveedora" };
  if (lauras.length > 1) return { accion: "alerta", motivo: "proveedora_ambigua" };

  const costo = input.costo;
  if (costo == null || !Number.isFinite(costo) || costo <= 0) {
    return { accion: "alerta", motivo: "falta_costo" };
  }

  return { accion: "crear", supplierId: lauras[0].id, unitCost: costo, combos };
}

// La alerta se calcula al vuelo (no se guarda): la venta trae el combo o no trae
// productos, y todavia no tiene orden ni esta cancelada.
export function necesitaAlertaCombo(venta: {
  items: ComboItem[];
  tieneOrden: boolean;
  cancelada: boolean;
}): boolean {
  if (venta.tieneOrden || venta.cancelada) return false;
  return venta.items.length === 0 || venta.items.some(esComboCamillas);
}

// Al crear la orden, un combo con componentes (ProductComponent) se reparte en una
// linea por pieza (expandQuoteItemsToOrderItems). El costo es POR COMBO, asi que
// va una sola vez: entero en la primera pieza con cantidad y 0 en las demas. Devuelve el costo
// unitario de cada pieza, de modo que sum(costo x cantidadPorCombo) = costo del combo.
export function repartirCostoCombo(
  costoPorCombo: number,
  piezas: Array<{ cantidadPorCombo: number }>,
): number[] {
  const primera = piezas.findIndex((pieza) => pieza.cantidadPorCombo > 0);
  return piezas.map((pieza, index) =>
    index === primera ? roundMoney(costoPorCombo / pieza.cantidadPorCombo) : 0,
  );
}

// Linea de la cotizacion de la venta. El combo puede venir de tres formas:
// A) en piezas, cada una con comboCode/comboKey/comboQuantity en las notas (asistente y CRM);
// B) como el producto combo con componentes, que la orden parte en piezas con
//    "Combo: <nombre>" en la descripcion y sin quoteItemId (expandQuoteItemToOrderItems);
// C) como el producto combo sin componentes: una sola linea.
export type LineaVenta = {
  id: string;
  productId: string;
  quantity: number;
  notes: string | null;
  product: { code: string | null; name: string; piezas: Array<{ productId: string; cantidadPorCombo: number }> };
};

// Items para planComboOrder: un combo en piezas (A) cuenta una vez por comboKey con comboQuantity.
// Tambien la usa /admin/ventas para la alerta: solo pide cantidad, notas y codigo.
export function itemsParaPlan(
  lineas: Array<Pick<LineaVenta, "quantity" | "notes"> & { product: { code: string | null } }>,
): ComboItem[] {
  const grupos = new Set<string>();
  const items: ComboItem[] = [];
  for (const linea of lineas) {
    const meta = parseQuoteItemMeta(linea.notes);
    if (meta.comboKey && meta.comboCode) {
      if (grupos.has(meta.comboKey)) continue;
      grupos.add(meta.comboKey);
      items.push({ codigo: meta.comboCode, cantidad: meta.comboQuantity });
    } else {
      items.push({ codigo: linea.product.code, cantidad: linea.quantity });
    }
  }
  return items;
}

// Codigos de los productos combo que trae la venta (para buscar el costo de Laura).
export function codigosComboDeVenta(lineas: LineaVenta[]): string[] {
  const codigos = new Set<string>();
  for (const item of itemsParaPlan(lineas)) {
    if (esComboCamillas(item) && item.cantidad > 0) codigos.add(normalizeProductCode(item.codigo));
  }
  return [...codigos];
}

export type ItemOrden = {
  id: string;
  quoteItemId: string | null;
  productId: string;
  quantity: number;
  notes: string | null;
  fulfillmentMode: string;
};

// Que items de la orden son del Combo Camillas y con que costo unitario se confirman con
// Laura. El costo es POR COMBO y va una sola vez por combo (en una pieza); las demas piezas
// van con 0, asi tambien quedan confirmadas con Laura y pasan a produccion. Los items por
// STOCK no se tocan: salen de bodega, no se le compran a Laura.
export function costosItemsCombo(
  costoPorCombo: number,
  lineas: LineaVenta[],
  items: ItemOrden[],
): Array<{ orderItemId: string; unitCost: number }> {
  const resultado = new Map<string, number>();
  const gruposConCosto = new Set<string>();

  for (const item of items) {
    if (item.fulfillmentMode === "STOCK") continue;
    const meta = parseQuoteItemMeta(item.notes);

    // A) pieza de un combo armado en la cotizacion: el costo de todo el grupo va en su primera pieza.
    if (meta.comboKey && esComboCamillas({ codigo: meta.comboCode })) {
      if (meta.comboQuantity <= 0 || item.quantity <= 0) continue;
      const primera = !gruposConCosto.has(meta.comboKey);
      gruposConCosto.add(meta.comboKey);
      resultado.set(item.id, primera ? roundMoney((costoPorCombo * meta.comboQuantity) / item.quantity) : 0);
      continue;
    }

    for (const linea of lineas) {
      if (!esComboCamillas({ codigo: linea.product.code })) continue;
      const piezas = linea.product.piezas;
      if (piezas.length === 0) {
        // C) el combo es una sola linea.
        if (item.quoteItemId === linea.id) resultado.set(item.id, roundMoney(costoPorCombo));
      } else if (item.quoteItemId === null && meta.description.endsWith(`Combo: ${linea.product.name}`)) {
        // B) pieza que la orden saco del combo.
        const index = piezas.findIndex((pieza) => pieza.productId === item.productId);
        if (index >= 0) resultado.set(item.id, repartirCostoCombo(costoPorCombo, piezas)[index]);
      }
      if (resultado.has(item.id)) break;
    }
  }

  return [...resultado].map(([orderItemId, unitCost]) => ({ orderItemId, unitCost }));
}

// ---------------------------------------------------------------------------------------------
// Aviso de la OF del combo (nov-2026, parte 2): ¿se le puede mandar sola la OF a la proveedora?
// Todavía no se manda nada; solo decide y, si falta algo, dice qué. Nunca adivina.

export type AvisoOFMotivo = "modo_sin_definir" | "falta_proveedora" | "falta_telefono_proveedora" | "falta_foto_color";

export type AvisoOFPlan =
  | { accion: "enviar" }
  | { accion: "nada" } // todas las piezas salen de bodega: no hay nada que mandarle
  | { accion: "alerta"; motivo: AvisoOFMotivo; color?: string };

// Un teléfono sirve para WhatsApp con al menos 7 dígitos.
export function telefonoSirve(telefono: string | null | undefined): boolean {
  return (telefono ?? "").replace(/\D/g, "").length >= 7;
}

export function planAvisoOF(input: {
  modos: Array<string | null | undefined>; // fulfillmentMode de cada pieza del combo
  proveedora: Proveedora | null; // la confirmada en las piezas de fábrica (una sola)
  telefono: string | null | undefined; // Supplier.phone
  foto: { fotoUrl: string } | null; // fotoExactaDelColor
  color: string; // etiqueta del color, para el aviso
}): AvisoOFPlan {
  // MIXED o sin modo: no dice si sale de bodega o de fábrica.
  if (input.modos.length === 0 || input.modos.some((modo) => modo !== "STOCK" && modo !== "MANUFACTURE")) {
    return { accion: "alerta", motivo: "modo_sin_definir" };
  }
  if (input.modos.every((modo) => modo === "STOCK")) return { accion: "nada" };
  if (!input.proveedora) return { accion: "alerta", motivo: "falta_proveedora" };
  if (!telefonoSirve(input.telefono)) return { accion: "alerta", motivo: "falta_telefono_proveedora" };
  if (!input.foto?.fotoUrl) {
    return { accion: "alerta", motivo: "falta_foto_color", color: input.color.trim() || "sin definir" };
  }
  return { accion: "enviar" };
}

// Texto corto del aviso para /admin/ventas y la tarjeta de la OF (null = no hay aviso).
export function textoAvisoOF(plan: AvisoOFPlan): string | null {
  if (plan.accion !== "alerta") return null;
  switch (plan.motivo) {
    case "falta_foto_color":
      return `Falta la foto del combo color ${plan.color}: mándala a mano o súbela`;
    case "modo_sin_definir":
      return "Falta definir si el combo sale de bodega o de fábrica: mándala a mano o defínelo";
    case "falta_proveedora":
      return "Falta la proveedora del combo: mándala a mano o confírmala";
    case "falta_telefono_proveedora":
      return "Falta el teléfono de la proveedora: mándala a mano o agrégalo";
  }
}

// Código del combo al que pertenece una línea de la orden (null = no es del combo). Mismas
// tres formas que costosItemsCombo: A) pieza con comboCode en las notas, C) la línea es el
// combo, B) pieza que la orden sacó del combo ("Combo: <nombre>" en la descripción).
export function codigoComboDeLinea(
  linea: { notes: string | null; productCode: string | null },
  combos: Array<{ code: string | null; name: string }>,
): string | null {
  const meta = parseQuoteItemMeta(linea.notes);
  if (meta.comboKey && esComboCamillas({ codigo: meta.comboCode })) return normalizeProductCode(meta.comboCode);
  if (esComboCamillas({ codigo: linea.productCode })) return normalizeProductCode(linea.productCode);
  const combo = combos.find((c) => esComboCamillas({ codigo: c.code }) && meta.description.endsWith(`Combo: ${c.name}`));
  return combo ? normalizeProductCode(combo.code) : null;
}
