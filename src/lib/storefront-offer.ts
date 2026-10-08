// Textos y calculos de oferta de la tienda publica (magilus.com). Reglas puras, sin Prisma.
//
// Decisiones de Alexander (8-oct-2026):
// - "Envio gratis" siempre lleva su condicion: pagando 50 % de anticipo. El envio gratis
//   aplica solo en las ciudades marcadas GRATIS en Transporte; el cliente lo consulta en /cobertura.
// - No se muestra precio "antes" tachado. Solo en combos: "Ahorras $X frente a comprar por
//   separado", con X = suma de los precios actuales de los componentes - precio del combo.

import { getCurrentStorePrice, type ProductPromoSource } from "./product-promo";

export const FREE_SHIPPING_LABEL = "Envío gratis pagando 50 % de anticipo";
export const FREE_SHIPPING_SHORT_LABEL = "Envío gratis con 50 % de anticipo";
export const FREE_SHIPPING_COVERAGE_PATH = "/cobertura";

export type ComboSavingsComponent = {
  quantity: number;
  price: unknown; // Decimal de Prisma, number o string
};

function toPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Ahorro del combo frente a comprar sus componentes por separado.
 * Devuelve null (no mostrar nada) si no hay componentes, si alguno no tiene precio o
 * cantidad validos, o si el ahorro no es positivo.
 */
export function computeComboSavings(
  comboPrice: unknown,
  components: ComboSavingsComponent[] | null | undefined,
): number | null {
  const combo = toPositiveNumber(comboPrice);
  if (combo == null || !components || components.length === 0) {
    return null;
  }

  let separateTotal = 0;
  for (const component of components) {
    const price = toPositiveNumber(component.price);
    if (price == null || !Number.isInteger(component.quantity) || component.quantity <= 0) {
      return null;
    }
    separateTotal += price * component.quantity;
  }

  const savings = Math.round(separateTotal - combo);
  return savings > 0 ? savings : null;
}

// Forma de Prisma para leer los componentes de un combo con su precio actual (y su oferta).
export const COMBO_SAVINGS_COMPONENTS_SELECT = {
  select: {
    quantity: true,
    child: { select: { price: true, regularPrice: true, promoPrice: true, promoStartsAt: true, promoEndsAt: true } },
  },
} as const;

// Precio actual = el que muestra la tienda hoy (oferta vigente o precio detal), tanto del
// combo como de cada componente.
export function comboSavingsFromProduct(
  product: ProductPromoSource & {
    isBundle: boolean;
    bundleComponents?: Array<{ quantity: number; child: ProductPromoSource }>;
  },
  now: Date = new Date(),
): number | null {
  if (!product.isBundle) {
    return null;
  }
  return computeComboSavings(
    getCurrentStorePrice(product, now),
    (product.bundleComponents ?? []).map((entry) => ({
      quantity: entry.quantity,
      price: getCurrentStorePrice(entry.child, now),
    })),
  );
}
