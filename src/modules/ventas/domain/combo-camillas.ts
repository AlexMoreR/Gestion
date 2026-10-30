// Reglas puras del Combo Camillas: cuando una venta lo trae, la orden se crea sola
// con la proveedora Laura y el costo por combo. Nunca se adivina: si falta algo o
// hay duda, se devuelve una alerta para que una persona lo resuelva.

export const COMBO_CAMILLAS_CODES = ["CMB005", "CAV-16"];

export type ComboItem = { productCode: string | null };

export type ComboPlan =
  | { accion: "crear"; supplierId: string; unitCost: number }
  | { accion: "nada" }
  | { accion: "alerta"; motivo: "falta_producto" | "falta_proveedora" | "proveedora_ambigua" | "falta_costo" };

export function esComboCamillas(item: ComboItem): boolean {
  const code = item.productCode?.trim().toUpperCase();
  return !!code && COMBO_CAMILLAS_CODES.includes(code);
}

function seLlamaLaura(name: string): boolean {
  const plain = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /\blaura\b/.test(plain);
}

// costo = costo por COMBO (no por pieza).
export function planComboOrder(input: {
  items: ComboItem[];
  proveedoras: Array<{ id: string; name: string }>;
  costo: number | null;
  yaTieneOrden: boolean;
}): ComboPlan {
  if (input.yaTieneOrden) return { accion: "nada" };
  if (input.items.length === 0) return { accion: "alerta", motivo: "falta_producto" };
  if (!input.items.some(esComboCamillas)) return { accion: "nada" };

  const lauras = input.proveedoras.filter((p) => seLlamaLaura(p.name));
  if (lauras.length === 0) return { accion: "alerta", motivo: "falta_proveedora" };
  if (lauras.length > 1) return { accion: "alerta", motivo: "proveedora_ambigua" };

  if (input.costo === null || !Number.isFinite(input.costo) || input.costo <= 0) {
    return { accion: "alerta", motivo: "falta_costo" };
  }

  return { accion: "crear", supplierId: lauras[0].id, unitCost: input.costo };
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

// Un combo (isBundle) se expande en una linea de orden por componente
// (expandQuoteItemsToOrderItems). El costo es POR COMBO: va completo en la primera
// linea y las demas quedan en 0, asi el cargo a la proveedora sale una sola vez.
// Devuelve el costo unitario de cada linea, en el mismo orden.
export function repartirCostoCombo(lineas: Array<{ quantity: number }>, combos: number, costoPorCombo: number): number[] {
  return lineas.map((linea, index) => {
    if (index > 0 || linea.quantity <= 0) return 0;
    return Math.round(((costoPorCombo * combos) / linea.quantity) * 100) / 100;
  });
}
