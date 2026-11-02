import { formatMoney } from "../../../lib/currency";
import { colombiaTimeOfDay, todayInColombia } from "../../../lib/colombia-time";

// Lo minimo de un producto que necesita la hoja "Precios vigentes".
export type PrecioVigenteInput = {
  id: string;
  code: string | null;
  name: string;
  categoryName: string | null;
  isBundle: boolean;
  hiddenFromStore: boolean;
  price: number;
  baseCost: number;
};

// Hoja Markdown con precio y COSTO de los productos visibles en la tienda, para Claude.
// Orden: mas unidades vendidas primero; empates y productos sin ventas, por nombre.
export function buildPreciosVigentes(
  products: readonly PrecioVigenteInput[],
  unitsSold: ReadonlyMap<string, number>,
  now: Date,
): string {
  const units = (id: string) => unitsSold.get(id) ?? 0;
  const lines = products
    .filter((product) => !product.hiddenFromStore)
    .sort((a, b) => units(b.id) - units(a.id) || a.name.localeCompare(b.name, "es"))
    .map((product) => {
      const queEs = product.isBundle ? "Combo" : product.categoryName ?? "Producto";
      return `- ${product.code ?? "sin código"} — ${product.name} — ${queEs} — ${formatMoney(product.price, "COP")} — ${formatMoney(product.baseCost, "COP")}`;
    });

  return [
    "# Precios vigentes",
    "",
    `Generado: ${todayInColombia(now)} ${colombiaTimeOfDay(now)} (hora de Colombia) · precio y costo de Gestión`,
    "",
    "código — nombre — qué es — precio — costo",
    "",
    ...lines,
    "",
  ].join("\n");
}
