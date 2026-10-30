// Datos de la ficha de producto tipo landing (magilus.com). Reglas puras, sin Prisma ni React.
//
// Decisiones (23-oct-2026, fase 2 de "Pagina de producto tipo landing"):
// - Garantia: "1 año de garantía" en todos; "y 5 años en el sistema hidráulico" SOLO si el
//   producto tiene sistema hidraulico (categoria o nombre/descripcion con "hidrau").
// - Nada de datos inventados: lo que no esta en Gestion dice "Pregúntale a la asesora".
// - Pago y envio: 50 % para fabricar + 50 % antes de despachar, con envio gratis a ciudades
//   principales (la lista no se escribe aca: se manda a consultar en /cobertura).
// - Contraentrega pagando el envio: SOLO el Combo Camillas (isCamillasCombo).
// - No llegamos a San Andrés, Leticia, Inírida, Mitú ni Bahía Solano.

import { expandProductNameForSeo, toSentenceCase } from "./seo-metadata";

export const ASK_ADVISOR_LABEL = "Pregúntale a la asesora";
export const WARRANTY_BASE_TEXT = "1 año de garantía";
export const WARRANTY_HYDRAULIC_TEXT = "1 año de garantía y 5 años en el sistema hidráulico";
export const FACTORY_LOCATIONS = "Cali y Bogotá";

export type HydraulicSource = {
  name: string;
  description?: string | null;
  categoryName?: string | null;
};

// Minusculas y sin tildes: "Hidráulica" -> "hidraulica".
function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// "hidrau" cubre hidraulico/a/s, hidráulica (sin tilde tras normalizar) y la abreviatura HIDRAU.
// No cuenta si va negado justo antes: "sin hidraulico", "no hidraulica", "sin sistema hidraulico".
function mentionsHydraulic(text: string): boolean {
  const pattern = /(^|[^a-z])((?:sin|no)\s+(?:sistema\s+)?)?hidrau/g;
  for (const match of text.matchAll(pattern)) {
    if (!match[2]) {
      return true;
    }
  }
  return false;
}

/** ¿El producto tiene sistema hidraulico? Categoria, nombre o descripcion con "hidrau". */
export function hasHydraulicSystem(product: HydraulicSource): boolean {
  return [product.categoryName, product.name, product.description].some((value) =>
    mentionsHydraulic(normalizeForMatch(value)),
  );
}

/** ¿Es el Combo Camillas? Combo (isBundle) cuyo nombre, sin tildes ni mayusculas, contiene "camilla". */
export function isCamillasCombo(product: { isBundle: boolean; name: string }): boolean {
  return product.isBundle && normalizeForMatch(product.name).includes("camilla");
}

/** Texto de garantia segun el producto (solo menciona el hidraulico si lo tiene). */
export function warrantyTextFor(product: HydraulicSource): string {
  return hasHydraulicSystem(product) ? WARRANTY_HYDRAULIC_TEXT : WARRANTY_BASE_TEXT;
}

/** Nombre para mostrar: "HIDRAU PRO REY" -> "Silla hidráulica PRO REY"; "SOFA CON BOTONES" -> "Sofa con botones". */
export function productDisplayName(name: string, categoryName?: string | null): string {
  return toSentenceCase(expandProductNameForSeo(name, categoryName)) || name.trim();
}

// Texto casi todo en MAYUSCULAS (como llegan muchas descripciones de Gestion).
function isMostlyUppercase(value: string): boolean {
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length < 4) {
    return false;
  }
  const upper = letters.filter((letter) => letter === letter.toLocaleUpperCase("es") && letter !== letter.toLocaleLowerCase("es"));
  return upper.length / letters.length > 0.7;
}

/**
 * Descripcion legible: espacios normalizados; si viene en MAYUSCULAS, en capitalizacion de
 * oracion. Si ya tiene mayusculas y minusculas, se respeta tal cual. Vacia -> "".
 */
export function readableDescription(value: string | null | undefined): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return isMostlyUppercase(normalized) ? toSentenceCase(normalized) : normalized;
}

/**
 * Medida escrita en la descripcion de Gestion, tal cual (sin inventar unidades):
 * "MEDIDA DE 1.40" -> "1.40"; "60 x 180 cm" -> "60 x 180 cm"; "1,80 m" -> "1,80 m".
 * null si no hay una medida reconocible.
 */
export function extractMeasureFromDescription(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }
  const number = String.raw`\d+(?:[.,]\d+)?`;
  const unit = String.raw`(?:\s*(?:cm|mts?|metros?|m)\b\.?)?`;
  const dims = String.raw`${number}(?:\s*[x×]\s*${number}){0,2}${unit}`;

  // 1) "medida(s) (de)? (:)? 1.40" / "mide 1.40"
  const labeled = text.match(new RegExp(String.raw`\b(?:medidas?|mide)\s*(?:de\s*)?:?\s*(${dims})`, "i"));
  if (labeled) {
    return labeled[1].trim();
  }
  // 2) "60 x 180 (cm)" sin etiqueta
  const crossed = text.match(new RegExp(String.raw`\b(${number}\s*[x×]\s*${number}(?:\s*[x×]\s*${number})?${unit})`, "i"));
  if (crossed) {
    return crossed[1].trim();
  }
  // 3) "180 cm" / "1,40 m" con unidad explicita
  const withUnit = text.match(new RegExp(String.raw`\b(${number}\s*(?:cm|mts?|metros?|m)\b\.?)`, "i"));
  return withUnit ? withUnit[1].trim() : null;
}

export type ProductSpecRow = {
  label: string;
  value: string;
  missing: boolean; // true -> "Pregúntale a la asesora"
};

export type ProductFaqItem = {
  question: string;
  answer: string;
};

export type ProductLandingSource = HydraulicSource & {
  code?: string | null;
  brandName: string;
  isBundle?: boolean;
};

export type ProductLandingData = {
  displayName: string;
  hydraulic: boolean;
  warrantyText: string;
  measure: string | null;
  description: string;
  chips: string[];
  specs: ProductSpecRow[];
  faq: ProductFaqItem[];
  cashOnDelivery: boolean;
};

function specRow(label: string, value: string | null | undefined): ProductSpecRow {
  const clean = value?.trim();
  return clean ? { label, value: clean, missing: false } : { label, value: ASK_ADVISOR_LABEL, missing: true };
}

/** Preguntas frecuentes con las reglas vigentes (sin cifras de envio, lista de ciudades ni tiempos inventados). */
export function buildProductFaq(input: { warrantyText: string; cashOnDelivery?: boolean }): ProductFaqItem[] {
  return [
    {
      question: "¿Cuánto cuesta el envío?",
      answer:
        "Envío gratis a ciudades principales. Para otras ciudades consulta la página de cobertura o pregúntale a la asesora por WhatsApp. No llegamos a San Andrés, Leticia, Inírida, Mitú ni Bahía Solano.",
    },
    {
      question: "¿Cómo se paga?",
      answer: `50 % para fabricar y 50 % antes de despachar, con envío gratis a ciudades principales.${
        input.cashOnDelivery ? " También puedes pagar contraentrega, pagando tú el envío." : ""
      }`,
    },
    {
      question: "¿Qué garantía tiene?",
      answer: `${input.warrantyText}.`,
    },
    {
      question: "¿Lo puedo pedir en otro color?",
      answer: "Sí. Pídele a la asesora los colores disponibles para este modelo.",
    },
    {
      question: "¿Cuánto tarda la fabricación?",
      answer: "La asesora te confirma la fecha según tu pedido y tu ciudad.",
    },
  ];
}

/** Arma los datos de la landing a partir de lo que hay en Gestion. */
export function buildProductLandingData(product: ProductLandingSource): ProductLandingData {
  const hydraulic = hasHydraulicSystem(product);
  const warrantyText = hydraulic ? WARRANTY_HYDRAULIC_TEXT : WARRANTY_BASE_TEXT;
  const displayName = productDisplayName(product.name, product.categoryName);
  const measure = extractMeasureFromDescription(product.description);
  const description = readableDescription(product.description);
  const categoryName = product.categoryName?.trim();
  const cashOnDelivery = isCamillasCombo({ isBundle: product.isBundle ?? false, name: product.name });

  const chips = [
    ...(measure ? [`Medida ${measure}`] : []),
    `Fábrica en ${FACTORY_LOCATIONS}`,
    WARRANTY_BASE_TEXT,
  ];

  const specs: ProductSpecRow[] = [
    specRow("Producto", categoryName ? `${displayName} (${categoryName.toLocaleLowerCase("es")})` : displayName),
    specRow("Medidas", measure),
    specRow("Material y tapizado", null),
    specRow("Garantía", warrantyText),
    ...(product.code?.trim() ? [specRow("Código", product.code)] : []),
    specRow("Fabricante", `${product.brandName.trim()}, ${FACTORY_LOCATIONS}`),
  ];

  return {
    displayName,
    hydraulic,
    warrantyText,
    measure,
    description,
    chips,
    specs,
    faq: buildProductFaq({ warrantyText, cashOnDelivery }),
    cashOnDelivery,
  };
}
