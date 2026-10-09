// Reglas puras de SEO (titles, descriptions y sitemap). Sin Prisma ni Next.

export const PRODUCT_TITLE_MAX_LENGTH = 60;
export const META_DESCRIPTION_MAX_LENGTH = 155;

// Palabras que se dejan como estan (codigos, medidas): tienen digitos o son siglas cortas
// con digitos, ej. "CAV14", "3", "2x1".
function keepsOriginalCase(word: string): boolean {
  return /\d/.test(word);
}

/**
 * Nombre de producto en "Capitalizacion de oracion": primera letra en mayuscula y el resto
 * en minuscula, salvo palabras con digitos (codigos). Ej. "CAMILLA CURVA LASHISTA" ->
 * "Camilla curva lashista".
 */
export function toSentenceCase(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const lowered = normalized
    .split(" ")
    .map((word) => (keepsOriginalCase(word) ? word : word.toLocaleLowerCase("es")))
    .join(" ");
  return lowered.charAt(0).toLocaleUpperCase("es") + lowered.slice(1);
}

// Recorta en el ultimo espacio que quepa y quita conectores sueltos al final ("+", "-", "y", ",").
function cutAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const slice = value.slice(0, maxLength + 1);
  const lastSpace = slice.lastIndexOf(" ");
  let cut = (lastSpace > 0 ? slice.slice(0, lastSpace) : value.slice(0, maxLength)).trim();
  // Quita restos que no aportan al final del recorte.
  for (;;) {
    const cleaned = cut.replace(/(\s+(\+|-|\/|&|y|e|o|de|del|con|para|en|la|el|los|las))+$/i, "").replace(/[\s,;:+\-/&]+$/, "");
    if (cleaned === cut) {
      break;
    }
    cut = cleaned;
  }
  return cut;
}

/**
 * Title de producto cuando no hay seoTitle: "<Nombre> | <precio> | <marca>", max ~60 car.
 * Si no cabe, se recorta el nombre por palabras; precio y marca siempre quedan.
 */
export function buildProductSeoTitle(input: {
  name: string;
  priceLabel: string;
  brandName: string;
  maxLength?: number;
}): string {
  const maxLength = input.maxLength ?? PRODUCT_TITLE_MAX_LENGTH;
  const name = toSentenceCase(input.name);
  const priceLabel = input.priceLabel.trim();
  const suffix = [priceLabel, input.brandName.trim()].filter(Boolean).join(" | ");
  const separator = name && suffix ? " | " : "";
  const budget = Math.max(12, maxLength - suffix.length - separator.length);
  const shortName = cutAtWord(name, budget);
  return `${shortName}${separator}${suffix}`;
}

/** Precio para el title: "$1.099.000" (sin espacio tras el signo). */
export function compactPriceLabel(formatted: string): string {
  return formatted.replace(/\s+/g, "");
}

/** Description recortada a ~155 car. por palabras, con "…" si se corto. */
export function truncateMetaDescription(value: string, maxLength = META_DESCRIPTION_MAX_LENGTH): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const cut = cutAtWord(normalized, maxLength - 1).replace(/[.,;:]+$/, "");
  return `${cut}…`;
}

// --- Sitemap ---

export type SitemapProductSource = {
  id: string;
  slug?: string | null;
  name: string;
  code?: string | null;
  updatedAt: Date;
  category?: { slug: string } | null;
};

export type SitemapCategorySource = {
  slug: string;
  updatedAt: Date;
  activeProductCount: number;
};

/** Productos con URL canonica (/<categoria>/<slug>): los que no tienen categoria se omiten. */
export function sitemapProducts<T extends SitemapProductSource>(products: T[]): Array<T & { category: { slug: string } }> {
  return products.filter(
    (product): product is T & { category: { slug: string } } => Boolean(product.category?.slug?.trim()),
  );
}

/** Solo categorias con al menos un producto visible en la tienda. */
export function sitemapCategories<T extends SitemapCategorySource>(categories: T[]): T[] {
  return categories.filter((category) => category.activeProductCount > 0);
}
