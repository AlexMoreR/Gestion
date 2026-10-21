import { prisma } from "./prisma";
import { buildProductPath } from "./product-slugs";

/**
 * Redireccion de fichas con enlace viejo (slug que ya no existe) hacia el producto
 * correcto, solo cuando la coincidencia es EXACTA y unica:
 *   1) codigo del producto = ultimo segmento del slug (sin importar mayusculas), o
 *   2) un unico producto cuyo slug termina exactamente en "-<segmento>".
 * Nunca rellena ceros ni busca parecidos (cav14 NO es CAV014). Si hay 0 o 2+
 * candidatos en un paso, se pasa al siguiente; si ninguno sirve -> null (404).
 * Los productos ocultos en la tienda nunca son destino.
 */

export type RedirectCandidate = {
  id: string;
  slug: string;
  name: string;
  code: string | null;
  hiddenFromStore: boolean;
  category: { slug: string } | null;
};

// Forma de codigo: letras seguidas de digitos (ej. cav14, bmv09, cmb012). Evita
// redirigir por palabras sueltas como "led".
const CODE_LIKE_SEGMENT = /^[a-z]+[0-9]+$/;
const MAX_SEGMENT_LENGTH = 20;

/** Ultimo segmento del slug, en minusculas, solo si tiene forma de codigo. */
export function codeLikeSegment(productSlug: string): string | null {
  if (typeof productSlug !== "string") return null;
  const segment = productSlug.trim().split("-").at(-1)?.toLowerCase() ?? "";
  if (!segment || segment.length > MAX_SEGMENT_LENGTH) return null;
  return CODE_LIKE_SEGMENT.test(segment) ? segment : null;
}

function isEligible(candidate: RedirectCandidate, requestedSlug: string): boolean {
  return !candidate.hiddenFromStore && candidate.slug !== requestedSlug;
}

/**
 * Decision pura: recibe los candidatos por codigo y por sufijo (pueden venir de mas,
 * se vuelven a filtrar aqui) y devuelve el producto destino o null.
 */
export function pickRedirectTarget(
  requestedSlug: string,
  candidates: { byCode: RedirectCandidate[]; bySuffix: RedirectCandidate[] },
): RedirectCandidate | null {
  const segment = codeLikeSegment(requestedSlug);
  if (!segment) return null;

  const codeUpper = segment.toUpperCase();
  const byCode = candidates.byCode.filter(
    (candidate) => isEligible(candidate, requestedSlug) && candidate.code?.toUpperCase() === codeUpper,
  );
  if (byCode.length === 1) return byCode[0];

  const suffix = `-${segment}`;
  const bySuffix = candidates.bySuffix.filter(
    (candidate) => isEligible(candidate, requestedSlug) && candidate.slug.endsWith(suffix),
  );
  if (bySuffix.length === 1) return bySuffix[0];

  return null;
}

const CANDIDATE_SELECT = {
  id: true,
  slug: true,
  name: true,
  code: true,
  hiddenFromStore: true,
  category: { select: { slug: true } },
} as const;

/** Ruta canonica a la que redirigir, o null (-> 404). Nunca lanza error. */
export async function findRedirectTarget(requestedSlug: string): Promise<string | null> {
  try {
    const segment = codeLikeSegment(requestedSlug);
    if (!segment) return null;

    const [byCode, bySuffix] = await Promise.all([
      prisma.product.findMany({
        where: { code: { equals: segment, mode: "insensitive" }, hiddenFromStore: false },
        select: CANDIDATE_SELECT,
        take: 3,
      }),
      prisma.product.findMany({
        where: { slug: { endsWith: `-${segment}` }, hiddenFromStore: false },
        select: CANDIDATE_SELECT,
        take: 3,
      }),
    ]);

    const target = pickRedirectTarget(requestedSlug, { byCode, bySuffix });
    return target ? buildProductPath(target) : null;
  } catch (error) {
    console.error("[product-redirect] fallo buscando destino", error);
    return null;
  }
}
