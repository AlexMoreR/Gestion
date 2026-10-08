// Precio normal y oferta con fechas (decision de Alexander, 8-oct-2026: "Tachado con respaldo").
// Reglas puras, sin Prisma.
//
// - Precio normal = regularPrice si esta cargado; si no, el precio detal (price).
// - Oferta vigente: promoPrice > 0, hoy entre promoStartsAt y promoEndsAt (ambas fechas cargadas)
//   y promoPrice < precio normal. Solo entonces la tienda muestra el precio normal tachado.
// - Sin oferta vigente se muestra solo el precio detal (price).
// - Las fechas se manejan en hora de Colombia (UTC-5, sin horario de verano): "desde" empieza a
//   las 00:00 y "hasta" termina a las 23:59:59.999 de ese dia.

const BOGOTA_OFFSET = "-05:00";
const BOGOTA_TIME_ZONE = "America/Bogota";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type ProductPromoSource = {
  price: unknown;
  regularPrice?: unknown;
  promoPrice?: unknown;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
};

export type ActivePromo = {
  promoPrice: number;
  normalPrice: number;
  off: number; // normalPrice - promoPrice (siempre > 0)
  startsAt: Date;
  endsAt: Date;
};

function toPositiveNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getNormalPrice(product: ProductPromoSource): number {
  return toPositiveNumber(product.regularPrice) ?? toPositiveNumber(product.price) ?? 0;
}

export function getActivePromo(product: ProductPromoSource, now: Date = new Date()): ActivePromo | null {
  const promoPrice = toPositiveNumber(product.promoPrice);
  const startsAt = toDate(product.promoStartsAt);
  const endsAt = toDate(product.promoEndsAt);
  if (promoPrice == null || !startsAt || !endsAt) {
    return null;
  }
  const time = now.getTime();
  if (time < startsAt.getTime() || time > endsAt.getTime()) {
    return null;
  }
  const normalPrice = getNormalPrice(product);
  if (!(promoPrice < normalPrice)) {
    return null;
  }
  return { promoPrice, normalPrice, off: Math.round(normalPrice - promoPrice), startsAt, endsAt };
}

// Precio que se muestra como vigente en la tienda: el de oferta si esta vigente; si no, price.
export function getCurrentStorePrice(product: ProductPromoSource, now: Date = new Date()): number {
  return getActivePromo(product, now)?.promoPrice ?? toPositiveNumber(product.price) ?? 0;
}

// --- Fechas (hora de Colombia) ---

export function startOfBogotaDay(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000${BOGOTA_OFFSET}`);
}

export function endOfBogotaDay(dateOnly: string): Date {
  return new Date(`${dateOnly}T23:59:59.999${BOGOTA_OFFSET}`);
}

// Fecha AAAA-MM-DD en hora de Colombia (para inputs type="date" y priceValidUntil).
export function toBogotaDateOnly(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Fecha legible para el cliente, ej. "8 oct 2026" (igual en servidor y navegador).
export function formatBogotaDate(value: Date): string {
  const dateOnly = toBogotaDateOnly(value);
  if (!dateOnly) {
    return "";
  }
  const [year, month, day] = dateOnly.split("-").map(Number);
  return `${day} ${MONTHS_ES[month - 1]} ${year}`;
}

// Texto del ⓘ junto al precio tachado.
export function promoInfoText(promo: ActivePromo, formatPrice: (value: number) => string): string {
  return `Precio normal ${formatPrice(promo.normalPrice)}. Oferta válida del ${formatBogotaDate(promo.startsAt)} al ${formatBogotaDate(promo.endsAt)}.`;
}

// --- Formulario de producto ---

export type ProductPromoFormFields = {
  regularPrice: number | null;
  promoPrice: number | null;
  promoStartsAt: string | null; // AAAA-MM-DD
  promoEndsAt: string | null; // AAAA-MM-DD
};

export function toPromoFormFields(product: {
  regularPrice: unknown;
  promoPrice: unknown;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
}): ProductPromoFormFields {
  return {
    regularPrice: toPositiveNumber(product.regularPrice),
    promoPrice: toPositiveNumber(product.promoPrice),
    promoStartsAt: toBogotaDateOnly(product.promoStartsAt),
    promoEndsAt: toBogotaDateOnly(product.promoEndsAt),
  };
}

export type ParsedProductPromo = {
  regularPrice: number | null;
  promoPrice: number | null;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
};

function parseMoneyInput(raw: unknown): number | null | undefined {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const cleaned = raw.replace(/[$\s.]/g, "").replace(",", ".");
  if (cleaned === "") {
    return null;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function parseDateInput(raw: unknown): string | null | undefined {
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
  return DATE_ONLY.test(value) && !Number.isNaN(startOfBogotaDay(value).getTime()) ? value : undefined;
}

/**
 * Lee "Precio normal" y "Oferta: precio + desde/hasta" del formulario.
 * Vacio = sin dato (null). Devuelve { error } si algo no es valido:
 * - montos no numericos o <= 0,
 * - oferta incompleta (precio sin fechas o fechas sin precio),
 * - "hasta" antes de "desde".
 */
export function parseProductPromoInput(input: {
  regularPrice: unknown;
  promoPrice: unknown;
  promoStartsAt: unknown;
  promoEndsAt: unknown;
}): { ok: true; value: ParsedProductPromo } | { ok: false; error: string } {
  const regularPrice = parseMoneyInput(input.regularPrice);
  if (regularPrice === undefined) {
    return { ok: false, error: "Precio normal invalido" };
  }
  const promoPrice = parseMoneyInput(input.promoPrice);
  if (promoPrice === undefined) {
    return { ok: false, error: "Precio de oferta invalido" };
  }
  const startsAt = parseDateInput(input.promoStartsAt);
  const endsAt = parseDateInput(input.promoEndsAt);
  if (startsAt === undefined || endsAt === undefined) {
    return { ok: false, error: "Fechas de la oferta invalidas" };
  }

  const anyPromo = promoPrice != null || startsAt != null || endsAt != null;
  if (anyPromo && (promoPrice == null || startsAt == null || endsAt == null)) {
    return { ok: false, error: "La oferta necesita precio, desde y hasta" };
  }
  if (startsAt != null && endsAt != null && endsAt < startsAt) {
    return { ok: false, error: "La oferta termina antes de empezar" };
  }

  return {
    ok: true,
    value: {
      regularPrice,
      promoPrice,
      promoStartsAt: startsAt ? startOfBogotaDay(startsAt) : null,
      promoEndsAt: endsAt ? endOfBogotaDay(endsAt) : null,
    },
  };
}
