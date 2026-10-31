import { formatMoney } from "../../../lib/currency";
import type { ProductRow } from "./entities";

export type PrecioVigenteProduct = Pick<
  ProductRow,
  "id" | "code" | "name" | "categoryName" | "isBundle" | "hiddenFromStore" | "price" | "baseCost"
>;

// "AAAA-MM-DD HH:MM" en hora de Colombia (sv-SE da ese formato).
const colombiaDateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function queEs(product: PrecioVigenteProduct): string {
  if (product.isBundle) return "Combo";
  return product.categoryName?.trim() || "Producto";
}

// Hoja Markdown de precios vigentes (lleva COSTO: solo para uso interno).
// Solo productos visibles en la tienda; los mas vendidos primero, empates por nombre.
export function buildPreciosVigentes(
  products: PrecioVigenteProduct[],
  unitsSold: Map<string, number>,
  now: Date,
): string {
  const units = (product: PrecioVigenteProduct) => unitsSold.get(product.id) ?? 0;
  const lines = products
    .filter((product) => !product.hiddenFromStore)
    .sort((left, right) => units(right) - units(left) || left.name.localeCompare(right.name, "es"))
    .map((product) =>
      [
        product.code?.trim() || "sin código",
        product.name,
        queEs(product),
        formatMoney(product.price, "COP"),
        formatMoney(product.baseCost, "COP"),
      ].join(" — "),
    );

  return [
    "# Precios vigentes",
    "",
    `Generado: ${colombiaDateTime.format(now)} (hora de Colombia) · precio y costo de Gestión`,
    "",
    "código — nombre — qué es — precio — costo",
    "",
    ...lines.map((line) => `- ${line}`),
    "",
  ].join("\n");
}
