// Origen de cada venta (decision de Alexander, 7-oct-2026). Reglas puras, sin Prisma.
//
// El origen sale de la linea de WhatsApp del chat en el CRM (AizenCRM):
//   Ventas 1 = META_ADS · Ventas 2 = MARKETPLACE · Admin = referidos y clientes recurrentes.
// El CRM no sabe si el cliente ya compro antes, por eso para la linea Admin manda
// REFERIDO_RECURRENTE y Gestion decide: si el cliente tiene una venta anterior -> RECURRENTE,
// si no -> REFERIDO. Venta sin chat (mostrador / venta directa) = MOSTRADOR. NULL = "Sin dato".
//
// Contrato con el CRM: POST /api/ventas/origen (ver src/app/api/ventas/origen/route.ts).

import { z } from "zod";

// Valores que se guardan en la base (enum SaleOrigin de Prisma).
export const SALE_ORIGINS = ["META_ADS", "MARKETPLACE", "REFERIDO", "RECURRENTE", "MOSTRADOR", "SIN_DATO"] as const;
export type SaleOriginCode = (typeof SALE_ORIGINS)[number];

// Valores que puede mandar el CRM: los de la base + REFERIDO_RECURRENTE (lo resuelve Gestion).
export const CRM_ORIGINS = [...SALE_ORIGINS, "REFERIDO_RECURRENTE"] as const;
export type CrmOriginCode = (typeof CRM_ORIGINS)[number];

export const SALE_ORIGIN_LABEL: Readonly<Record<SaleOriginCode, string>> = {
  META_ADS: "Meta Ads",
  MARKETPLACE: "Marketplace",
  REFERIDO: "Referido",
  RECURRENTE: "Recurrente",
  MOSTRADOR: "Mostrador",
  SIN_DATO: "Sin dato",
};

// Orden fijo para filtros y reportes. "Sin dato" siempre al final.
export const SALE_ORIGIN_ORDER: readonly SaleOriginCode[] = SALE_ORIGINS;

// Clases del badge (mismo estilo de los demas badges del admin, ver payment-method.ts).
export const SALE_ORIGIN_BADGE: Readonly<Record<SaleOriginCode, string>> = {
  META_ADS: "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400",
  MARKETPLACE: "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-400",
  REFERIDO: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  RECURRENTE: "border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-400",
  MOSTRADOR: "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-400",
  SIN_DATO: "border-border bg-muted text-muted-foreground",
};

export function isSaleOrigin(value: unknown): value is SaleOriginCode {
  return typeof value === "string" && (SALE_ORIGINS as readonly string[]).includes(value);
}

// null/desconocido cuenta como "Sin dato": asi el reporte nunca esconde ventas sin origen.
export function effectiveOrigin(value: unknown): SaleOriginCode {
  return isSaleOrigin(value) ? value : "SIN_DATO";
}

export function saleOriginLabel(value: unknown): string {
  return SALE_ORIGIN_LABEL[effectiveOrigin(value)];
}

// Lee ?origen= de /admin/ventas. Acepta el enum (en cualquier mayuscula). Vacio o invalido = sin filtro.
export function parseOriginFilter(raw: unknown): SaleOriginCode | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim().toUpperCase();
  return isSaleOrigin(value) ? value : null;
}

// --- Regla REFERIDO_RECURRENTE ---

// Linea Admin: si el cliente ya tenia una venta anterior es RECURRENTE; si no, REFERIDO.
// Los demas origenes pasan tal cual.
export function resolveCrmOrigin(origin: CrmOriginCode, hasPreviousSales: boolean): SaleOriginCode {
  if (origin === "REFERIDO_RECURRENTE") {
    return hasPreviousSales ? "RECURRENTE" : "REFERIDO";
  }
  return origin;
}

// --- Relleno de ventas viejas (scripts/rellenar-origen-ventas.ts) ---

// Sin telefono o sin chat en el CRM: venta directa = MOSTRADOR; cualquier otra = SIN_DATO.
export function backfillFallbackOrigin(isDirectSale: boolean): SaleOriginCode {
  return isDirectSale ? "MOSTRADOR" : "SIN_DATO";
}

// La venta directa crea su cotizacion interna y la venta en la misma transaccion, asi que nacen con
// segundos de diferencia; una venta desde cotizacion se registra despues (o con la fecha del abono).
// No hay un campo que lo diga, por eso es "probable". Si la venta directa se cargo con otra fecha
// (saleDate) no se detecta y queda SIN_DATO: es lo conservador.
export function isProbableDirectSale(input: { quoteCreatedAt: Date; saleCreatedAt: Date }): boolean {
  return Math.abs(input.saleCreatedAt.getTime() - input.quoteCreatedAt.getTime()) <= 5_000;
}

// --- Codigo de cotizacion ---

// Las cotizaciones se guardan como "COT-00121" (5 digitos, ver buildQuoteCode en sales-actions).
// El CRM recibe el codigo escrito por una asesora, asi que se acepta "cot 121", "COT-121",
// " cot-00121 " y "COT00121". Devuelve los codigos a buscar (el canonico primero), o [] si no hay
// nada que buscar. Un codigo con otro formato se busca tal cual (en mayusculas, sin espacios).
export function quoteCodeCandidates(raw: unknown): string[] {
  if (typeof raw !== "string") {
    return [];
  }
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  if (!compact) {
    return [];
  }
  const match = /^COT[-_]?0*(\d{1,9})$/.exec(compact);
  if (!match) {
    return [compact];
  }
  const number = match[1];
  const canonical = `COT-${number.padStart(5, "0")}`;
  const unpadded = `COT-${number}`;
  return canonical === unpadded ? [canonical] : [canonical, unpadded];
}

// Cliente generico unico de las ventas de mostrador (ver adminCreateDirectSaleAction). Sus ventas
// no dicen nada de la persona: para decidir si es recurrente se cruza por telefono.
export const CONSUMIDOR_FINAL_EMAIL = "consumidor-final@magilus.local";

// --- Telefonos (solo para cruzar; nunca se guardan ni se imprimen completos) ---

export function phoneDigits(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\D+/g, "") : "";
}

// Clave para comparar telefonos colombianos guardados con o sin 57 / +57: los ultimos 10 digitos.
// Menos de 7 digitos no sirve para cruzar (null).
export function phoneMatchKey(raw: unknown): string | null {
  const digits = phoneDigits(raw);
  if (digits.length < 7) {
    return null;
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Para logs y salida de scripts: solo los ultimos 4 digitos.
export function maskPhone(raw: unknown): string {
  const digits = phoneDigits(raw);
  if (!digits) {
    return "(sin telefono)";
  }
  return `***${digits.slice(-4)}`;
}

// --- Aviso del CRM (body del POST) ---

// Los ids pueden llegar como numero; se guardan como texto.
const textField = z.preprocess(
  (value) => (typeof value === "number" && Number.isFinite(value) ? String(value) : value),
  z.string().trim().max(500).nullish(),
);

// Solo se guardan estas llaves: cualquier otra (p. ej. un telefono) se descarta a proposito
// (z.object quita las llaves desconocidas por defecto).
const originDetailSchema = z.object({
  adId: textField,
  adTitle: textField,
  sourceApp: textField,
  ctwaClid: textField,
  adSourceUrl: textField,
  mkCuenta: textField,
  marketplaceItemId: textField,
  crmContactId: textField,
  channelId: textField,
  capturadoEn: textField,
  via: z.enum(["cotizacion", "telefono", "manual"]).nullish(),
});

const originNoticeSchema = z.object({
  quoteCode: z.string().trim().min(1).max(40),
  origin: z.enum(CRM_ORIGINS),
  originDetail: originDetailSchema.nullish(),
  linea: z.string().trim().max(120).nullish(),
  contactPhone: z.string().trim().max(40).nullish(),
});

export type OriginDetail = Partial<Record<Exclude<keyof z.infer<typeof originDetailSchema>, "via">, string>> & {
  via?: "cotizacion" | "telefono" | "manual";
  linea?: string;
};

export type OriginNotice = {
  quoteCodes: string[]; // candidatos a buscar (canonico primero)
  quoteCode: string; // como lo mando el CRM (recortado)
  origin: CrmOriginCode;
  originDetail: OriginDetail | null;
  contactPhone: string | null; // solo para decidir recurrencia; NO se guarda
};

// Arma el Json a guardar: quita vacios y agrega "linea" adentro. null si no queda nada.
export function buildOriginDetail(
  detail: Record<string, unknown> | null | undefined,
  linea: string | null | undefined,
): OriginDetail | null {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(detail ?? {})) {
    if (typeof value === "string" && value.trim()) {
      result[key] = value.trim();
    }
  }
  const line = linea?.trim();
  if (line) {
    result.linea = line;
  }
  return Object.keys(result).length > 0 ? (result as OriginDetail) : null;
}

export function parseOriginNotice(body: unknown): { ok: true; notice: OriginNotice } | { ok: false } {
  const parsed = originNoticeSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false };
  }
  const quoteCodes = quoteCodeCandidates(parsed.data.quoteCode);
  if (quoteCodes.length === 0) {
    return { ok: false };
  }
  return {
    ok: true,
    notice: {
      quoteCodes,
      quoteCode: parsed.data.quoteCode,
      origin: parsed.data.origin,
      originDetail: buildOriginDetail(parsed.data.originDetail, parsed.data.linea),
      contactPhone: parsed.data.contactPhone?.trim() || null,
    },
  };
}

// --- Respuesta del CRM al buscar por telefono (script de relleno) ---

const crmLookupSchema = z.object({
  encontrado: z.boolean(),
  origin: z.enum(CRM_ORIGINS).nullish(),
  originDetail: originDetailSchema.nullish(),
  linea: z.string().trim().max(120).nullish(),
});

export type CrmLookupResult =
  | { encontrado: false }
  | { encontrado: true; origin: CrmOriginCode; originDetail: OriginDetail | null };

// Respuesta invalida o "encontrado" sin origen -> null (se trata como error, no como "sin chat").
export function parseCrmLookup(body: unknown): CrmLookupResult | null {
  const parsed = crmLookupSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  if (!parsed.data.encontrado) {
    return { encontrado: false };
  }
  if (!parsed.data.origin) {
    return null;
  }
  return {
    encontrado: true,
    origin: parsed.data.origin,
    originDetail: buildOriginDetail(parsed.data.originDetail, parsed.data.linea),
  };
}

// Resumen legible del detalle (MCP del asesor): solo lo util para atribuir; null si no hay nada.
export function originDetailSummary(detail: unknown): {
  anuncio: string | null;
  id_anuncio: string | null;
  app: string | null;
  cuenta_mk: string | null;
  item_marketplace: string | null;
  linea: string | null;
  via: string | null;
} | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }
  const record = detail as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" && (record[key] as string).trim() ? (record[key] as string).trim() : null);
  const summary = {
    anuncio: text("adTitle"),
    id_anuncio: text("adId"),
    app: text("sourceApp"),
    cuenta_mk: text("mkCuenta"),
    item_marketplace: text("marketplaceItemId"),
    linea: text("linea"),
    via: text("via"),
  };
  return Object.values(summary).some((value) => value !== null) ? summary : null;
}

// --- Campana / anuncio para el reporte ---

// Clave de agrupacion por anuncio: el id si existe (no cambia aunque editen el titulo), si no el
// titulo. El titulo es lo que se muestra porque es lo que el equipo reconoce.
export function adKeyFromDetail(detail: unknown): { key: string; adTitle: string | null; adId: string | null } | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }
  const record = detail as Record<string, unknown>;
  const adTitle = typeof record.adTitle === "string" && record.adTitle.trim() ? record.adTitle.trim() : null;
  const adId = typeof record.adId === "string" && record.adId.trim() ? record.adId.trim() : null;
  if (!adTitle && !adId) {
    return null;
  }
  return { key: adId ?? adTitle!, adTitle, adId };
}
