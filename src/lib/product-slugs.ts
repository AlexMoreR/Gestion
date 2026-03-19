type ProductSlugSource = {
  id: string;
  name: string;
  code?: string | null;
};

export function slugifyProductSegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildProductSlug(product: ProductSlugSource): string {
  const nameSegment = slugifyProductSegment(product.name) || "producto";
  const codeSegment = product.code ? slugifyProductSegment(product.code) : "";

  return [nameSegment, codeSegment, product.id].filter(Boolean).join("-");
}

export function buildProductPath(product: ProductSlugSource): string {
  return `/productos/${buildProductSlug(product)}`;
}

export function getProductIdFromRouteParam(param: string): string {
  const normalized = param.trim();
  if (!normalized.includes("-")) {
    return normalized;
  }

  return normalized.split("-").at(-1) ?? normalized;
}
