// Forma de pago de la venta (decision de Alexander, 7-oct-2026). Reglas puras, sin Prisma.
// - 50/50: 50 % anticipo + 50 % al terminar; envio gratis en ciudades de envio GRATIS.
// - Contraentrega: solo combo de camilla. El envio se cobra: Bogota $100.000; Cali, Medellin y
//   demas ciudades de envio GRATIS $150.000; las otras ciudades se cotizan.

import { normalizePlaceName, type ShippingTypeName } from "../../transporte/domain/shipping";

export const SALE_PAYMENT_METHODS = ["ANTICIPO_50_50", "CONTRAENTREGA"] as const;
export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Readonly<Record<SalePaymentMethod, string>> = {
  ANTICIPO_50_50: "50 % anticipo + 50 % al terminar (envío gratis en ciudades principales)",
  CONTRAENTREGA: "Contraentrega (solo combo de camilla; el envío se cobra)",
};

export const PAYMENT_METHOD_SHORT_LABEL: Readonly<Record<SalePaymentMethod, string>> = {
  ANTICIPO_50_50: "50/50",
  CONTRAENTREGA: "Contraentrega",
};

// Clases del badge (mismo estilo de los demas badges del admin).
export const PAYMENT_METHOD_BADGE: Readonly<Record<SalePaymentMethod, string>> = {
  ANTICIPO_50_50: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-400",
  CONTRAENTREGA: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export function isSalePaymentMethod(value: unknown): value is SalePaymentMethod {
  return typeof value === "string" && (SALE_PAYMENT_METHODS as readonly string[]).includes(value);
}

// Lee el campo "Forma de pago" de un formulario: vacio/ausente -> null (sin definir),
// valor valido -> el valor, cualquier otra cosa -> undefined (invalido).
export function parsePaymentMethodInput(raw: unknown): SalePaymentMethod | null | undefined {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const value = raw.trim();
  if (value === "") {
    return null;
  }
  return isSalePaymentMethod(value) ? value : undefined;
}

// --- Envio en contraentrega ---

export const CONTRAENTREGA_FEE_BOGOTA = 100_000;
export const CONTRAENTREGA_FEE_MAIN_CITY = 150_000;

const BOGOTA_CODE = "11001";
const CALI_CODE = "76001";
const MEDELLIN_CODE = "05001";

// Valor del envio que paga el cliente en contraentrega. null = se cotiza (ciudad sin envio
// GRATIS o sin ciudad identificada). Nunca se inventa un valor.
export function contraentregaShippingFee(city: {
  code: string | null | undefined;
  shippingType: ShippingTypeName | null | undefined;
} | null): number | null {
  if (!city?.code) {
    return null;
  }
  if (city.code === BOGOTA_CODE) {
    return CONTRAENTREGA_FEE_BOGOTA;
  }
  if (city.code === CALI_CODE || city.code === MEDELLIN_CODE || city.shippingType === "GRATIS") {
    return CONTRAENTREGA_FEE_MAIN_CITY;
  }
  return null;
}

// --- Combo de camilla ---

// En el catalogo los combos de camilla estan en la categoria "COMBO DE CAMILLAS" con codigo CMBxx.
// Se reconoce por la categoria (tiene "combo" y "camilla") o por el codigo CMB. Como un combo
// armado (isBundle) se guarda en la venta separado en sus componentes, tambien cuenta un producto
// que es componente de un combo de camilla (parents).
export type ComboCheckProduct = {
  code?: string | null;
  categoryName?: string | null;
  parents?: { code?: string | null; categoryName?: string | null }[];
};

function looksLikeCamillaCombo(product: { code?: string | null; categoryName?: string | null }): boolean {
  const category = normalizePlaceName(product.categoryName ?? "");
  if (category.includes("combo") && category.includes("camilla")) {
    return true;
  }
  return /^cmb/i.test((product.code ?? "").trim());
}

// Adapta un producto leido con COMBO_CHECK_PRODUCT_SELECT (forma de Prisma) a ComboCheckProduct.
export const COMBO_CHECK_PRODUCT_SELECT = {
  code: true,
  category: { select: { name: true } },
  partOfBundles: { select: { parent: { select: { code: true, category: { select: { name: true } } } } } },
} as const;

type ProductRowForCombo = {
  code: string | null;
  category: { name: string } | null;
  partOfBundles?: { parent: { code: string | null; category: { name: string } | null } }[];
};

export function toComboCheckProduct(product: ProductRowForCombo): ComboCheckProduct {
  return {
    code: product.code,
    categoryName: product.category?.name ?? null,
    parents: (product.partOfBundles ?? []).map((entry) => ({
      code: entry.parent.code,
      categoryName: entry.parent.category?.name ?? null,
    })),
  };
}

export function isCamillaComboProduct(product: ComboCheckProduct): boolean {
  return looksLikeCamillaCombo(product) || (product.parents ?? []).some(looksLikeCamillaCombo);
}

// Aviso suave: contraentrega sin ningun combo de camilla en la venta. No bloquea.
export function contraentregaComboWarning(
  paymentMethod: SalePaymentMethod | null | undefined,
  products: ComboCheckProduct[],
): string | null {
  if (paymentMethod !== "CONTRAENTREGA") {
    return null;
  }
  if (products.some(isCamillaComboProduct)) {
    return null;
  }
  return "Contraentrega es solo para el combo de camilla y esta venta no tiene uno. Revisa la forma de pago.";
}

// --- Cobro al recibir (guia Magilus) ---

export type CollectSuggestion = {
  amount: number; // valor sugerido para "cobro al recibir" (siempre editable)
  saleBalance: number; // saldo pendiente de la venta
  shippingFee: number | null; // envio contraentrega incluido (null si no aplica o se cotiza)
  shippingPending: boolean; // contraentrega con envio por cotizar: sumarlo a mano
};

// 50/50 (o sin definir): se sugiere el saldo (lo esperado es $0 al despachar).
// Contraentrega: saldo + envio contraentrega segun la ciudad destino.
export function suggestAmountToCollect(params: {
  paymentMethod: SalePaymentMethod | null | undefined;
  saleBalance: number;
  destination: { code: string | null | undefined; shippingType: ShippingTypeName | null | undefined } | null;
}): CollectSuggestion {
  const saleBalance = Math.max(0, Math.round(params.saleBalance));
  if (params.paymentMethod !== "CONTRAENTREGA") {
    return { amount: saleBalance, saleBalance, shippingFee: null, shippingPending: false };
  }
  const fee = contraentregaShippingFee(params.destination);
  return {
    amount: saleBalance + (fee ?? 0),
    saleBalance,
    shippingFee: fee,
    shippingPending: fee == null,
  };
}
