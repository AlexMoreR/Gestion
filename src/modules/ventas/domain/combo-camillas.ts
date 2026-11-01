// Reglas puras del Combo Camillas: cuando una venta trae el combo, su orden se
// crea sola y el item se confirma con la proveedora Laura al costo pactado.
// Aqui solo se decide QUE hacer; nunca se adivina: si falta un dato o hay duda,
// la respuesta es una alerta para que una persona lo resuelva.
// Imports relativos a src/lib porque Vitest no resuelve el alias "@/".
import { roundMoney } from "../../../lib/pricing";
import { normalizeProductCode } from "../../../lib/product-code";

export const COMBO_CAMILLAS_CODES = ["CMB005", "CAV-16"] as const;

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
