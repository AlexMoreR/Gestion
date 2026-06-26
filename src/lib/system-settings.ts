import { cache } from "react";
import { DEFAULT_SYSTEM_CURRENCY, isSupportedCurrency, type SupportedCurrencyCode } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/site";

const CURRENCY_SETTING_KEY = "currency";
const PRIMARY_COLOR_SETTING_KEY = "primaryColor";
const BRAND_NAME_SETTING_KEY = "brandName";
const WHATSAPP_PHONE_SETTING_KEY = "whatsAppPhone";
const STOREFRONT_LOGO_PATH_SETTING_KEY = "storefrontLogoPath";
const STOREFRONT_HERO_TITLE_SETTING_KEY = "storefrontHeroTitle";
const STOREFRONT_HERO_DESCRIPTION_SETTING_KEY = "storefrontHeroDescription";
const STOREFRONT_PROMO_ITEMS_SETTING_KEY = "storefrontPromoItems";
const MIN_RETAIL_MARGIN_SETTING_KEY = "minRetailMarginPct";
const MIN_WHOLESALE_MARGIN_SETTING_KEY = "minWholesaleMarginPct";
const DEFAULT_MIN_RETAIL_MARGIN_PCT = 0;
const DEFAULT_MIN_WHOLESALE_MARGIN_PCT = 0;
const DEFAULT_SYSTEM_PRIMARY_COLOR = "#6d28d9";
const DEFAULT_SYSTEM_WHATSAPP_PHONE = siteConfig.phoneDisplay;
const DEFAULT_STOREFRONT_LOGO_PATH = siteConfig.logoPath;
const DEFAULT_STOREFRONT_HERO_TITLE = "Equipa tu peluqueria, barberia o salon de belleza";
const DEFAULT_STOREFRONT_HERO_DESCRIPTION =
  "Sillas, camillas, tocadores y mobiliario profesional con garantia y envio a toda Colombia.";
const DEFAULT_STOREFRONT_PROMO_ITEMS = [
  "Combos especiales de temporada",
  "Envio gratis en productos seleccionados",
  "Te ayudamos por WhatsApp a elegir tu mobiliario",
  "Descuentos por compras al por mayor",
  "Instalacion y asesoria para tu salon",
] as const;

async function ensureAppSettingTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppSetting" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getAppSettingValue(key: string): Promise<string | null> {
  await ensureAppSettingTable();

  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT "value"
    FROM "AppSetting"
    WHERE "key" = ${key}
    LIMIT 1
  `;

  const value = rows[0]?.value;
  return typeof value === "string" ? value : null;
}

async function setAppSettingValue(key: string, value: string): Promise<void> {
  await ensureAppSettingTable();
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "createdAt", "updatedAt")
    VALUES (${key}, ${value}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("key")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

export const getSystemCurrency = cache(async (): Promise<SupportedCurrencyCode> => {
  try {
    const value = await getAppSettingValue(CURRENCY_SETTING_KEY);
    if (value && isSupportedCurrency(value)) {
      return value;
    }

    return DEFAULT_SYSTEM_CURRENCY;
  } catch {
    return DEFAULT_SYSTEM_CURRENCY;
  }
});

export async function setSystemCurrency(currency: SupportedCurrencyCode): Promise<void> {
  await setAppSettingValue(CURRENCY_SETTING_KEY, currency);
}

function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }

  const shortHex = trimmed.match(/^#([0-9a-f]{3})$/);
  if (!shortHex) {
    return null;
  }

  const [r, g, b] = shortHex[1].split("");
  return `#${r}${r}${g}${g}${b}${b}`;
}

function darkenHexColor(hex: string, amount = 0.14): string {
  const value = normalizeHexColor(hex) ?? DEFAULT_SYSTEM_PRIMARY_COLOR;
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  const factor = Math.max(0, Math.min(1, 1 - amount));

  const nextR = Math.round(r * factor);
  const nextG = Math.round(g * factor);
  const nextB = Math.round(b * factor);

  return `#${nextR.toString(16).padStart(2, "0")}${nextG.toString(16).padStart(2, "0")}${nextB
    .toString(16)
    .padStart(2, "0")}`;
}

export const getSystemPrimaryColor = cache(async (): Promise<string> => {
  try {
    return normalizeHexColor(await getAppSettingValue(PRIMARY_COLOR_SETTING_KEY)) ?? DEFAULT_SYSTEM_PRIMARY_COLOR;
  } catch {
    return DEFAULT_SYSTEM_PRIMARY_COLOR;
  }
});

export const getSystemPrimaryStrongColor = cache(async (): Promise<string> => {
  const primary = await getSystemPrimaryColor();
  return darkenHexColor(primary);
});

export async function setSystemPrimaryColor(color: string): Promise<void> {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    throw new Error("Color primario invalido");
  }

  await setAppSettingValue(PRIMARY_COLOR_SETTING_KEY, normalized);
}

export const getSystemBrandName = cache(async (): Promise<string> => {
  try {
    const value = (await getAppSettingValue(BRAND_NAME_SETTING_KEY))?.trim();
    return value || siteConfig.name;
  } catch {
    return siteConfig.name;
  }
});

export async function setSystemBrandName(brandName: string): Promise<void> {
  const normalized = brandName.trim();
  if (!normalized) {
    throw new Error("Nombre de marca invalido");
  }

  await setAppSettingValue(BRAND_NAME_SETTING_KEY, normalized);
}

function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (!/^[+\d\s()-]+$/.test(normalized)) {
    return null;
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  return normalized;
}

function normalizeWhatsAppPhoneDigits(value: string | null | undefined): string | null {
  const normalized = normalizeWhatsAppPhone(value);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\D/g, "");
}

export const getSystemWhatsAppPhoneDisplay = cache(async (): Promise<string> => {
  try {
    return normalizeWhatsAppPhone(await getAppSettingValue(WHATSAPP_PHONE_SETTING_KEY)) ?? DEFAULT_SYSTEM_WHATSAPP_PHONE;
  } catch {
    return DEFAULT_SYSTEM_WHATSAPP_PHONE;
  }
});

export const getSystemWhatsAppPhoneHref = cache(async (): Promise<string> => {
  const phone = await getSystemWhatsAppPhoneDisplay();
  return normalizeWhatsAppPhoneDigits(phone) ?? siteConfig.phoneHref.replace("+", "");
});

export async function setSystemWhatsAppPhone(phone: string): Promise<void> {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) {
    throw new Error("WhatsApp invalido");
  }

  await setAppSettingValue(WHATSAPP_PHONE_SETTING_KEY, normalized);
}

export async function buildSystemWhatsAppHref(message: string): Promise<string> {
  const phoneHref = await getSystemWhatsAppPhoneHref();
  return `https://wa.me/${phoneHref}?text=${encodeURIComponent(message)}`;
}

export const getSystemStorefrontLogoPath = cache(async (): Promise<string> => {
  try {
    const value = (await getAppSettingValue(STOREFRONT_LOGO_PATH_SETTING_KEY))?.trim();
    return value || DEFAULT_STOREFRONT_LOGO_PATH;
  } catch {
    return DEFAULT_STOREFRONT_LOGO_PATH;
  }
});

export async function setSystemStorefrontLogoPath(logoPath: string): Promise<void> {
  const normalized = logoPath.trim();
  if (!normalized.startsWith("/")) {
    throw new Error("Logo principal invalido");
  }

  await setAppSettingValue(STOREFRONT_LOGO_PATH_SETTING_KEY, normalized);
}

export const getSystemStorefrontHeroTitle = cache(async (): Promise<string> => {
  try {
    const value = (await getAppSettingValue(STOREFRONT_HERO_TITLE_SETTING_KEY))?.trim();
    return value || DEFAULT_STOREFRONT_HERO_TITLE;
  } catch {
    return DEFAULT_STOREFRONT_HERO_TITLE;
  }
});

export async function setSystemStorefrontHeroTitle(title: string): Promise<void> {
  const normalized = title.trim();
  if (!normalized) {
    throw new Error("Titulo principal invalido");
  }

  await setAppSettingValue(STOREFRONT_HERO_TITLE_SETTING_KEY, normalized);
}

export const getSystemStorefrontHeroDescription = cache(async (): Promise<string> => {
  try {
    const value = (await getAppSettingValue(STOREFRONT_HERO_DESCRIPTION_SETTING_KEY))?.trim();
    return value || DEFAULT_STOREFRONT_HERO_DESCRIPTION;
  } catch {
    return DEFAULT_STOREFRONT_HERO_DESCRIPTION;
  }
});

export async function setSystemStorefrontHeroDescription(description: string): Promise<void> {
  const normalized = description.trim();
  if (!normalized) {
    throw new Error("Descripcion principal invalida");
  }

  await setAppSettingValue(STOREFRONT_HERO_DESCRIPTION_SETTING_KEY, normalized);
}

export const getSystemStorefrontPromoItems = cache(async (): Promise<string[]> => {
  try {
    const raw = await getAppSettingValue(STOREFRONT_PROMO_ITEMS_SETTING_KEY);
    if (!raw) {
      return [...DEFAULT_STOREFRONT_PROMO_ITEMS];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_STOREFRONT_PROMO_ITEMS];
    }

    const items = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 12);

    return items.length > 0 ? items : [...DEFAULT_STOREFRONT_PROMO_ITEMS];
  } catch {
    return [...DEFAULT_STOREFRONT_PROMO_ITEMS];
  }
});

export async function setSystemStorefrontPromoItems(items: string[]): Promise<void> {
  const normalized = items.map((item) => item.trim()).filter(Boolean).slice(0, 12);
  if (normalized.length === 0) {
    throw new Error("Mensajes promocionales invalidos");
  }

  await setAppSettingValue(STOREFRONT_PROMO_ITEMS_SETTING_KEY, JSON.stringify(normalized));
}

function normalizeMarginPct(value: string | null | undefined, fallback: number): number {
  if (value == null) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.min(parsed, 100000);
}

export const getSystemMinRetailMarginPct = cache(async (): Promise<number> => {
  try {
    return normalizeMarginPct(
      await getAppSettingValue(MIN_RETAIL_MARGIN_SETTING_KEY),
      DEFAULT_MIN_RETAIL_MARGIN_PCT,
    );
  } catch {
    return DEFAULT_MIN_RETAIL_MARGIN_PCT;
  }
});

export const getSystemMinWholesaleMarginPct = cache(async (): Promise<number> => {
  try {
    return normalizeMarginPct(
      await getAppSettingValue(MIN_WHOLESALE_MARGIN_SETTING_KEY),
      DEFAULT_MIN_WHOLESALE_MARGIN_PCT,
    );
  } catch {
    return DEFAULT_MIN_WHOLESALE_MARGIN_PCT;
  }
});

export async function setSystemMinMargins(retailPct: number, wholesalePct: number): Promise<void> {
  if (!Number.isFinite(retailPct) || retailPct < 0 || !Number.isFinite(wholesalePct) || wholesalePct < 0) {
    throw new Error("Reglas de margen invalidas");
  }

  await Promise.all([
    setAppSettingValue(MIN_RETAIL_MARGIN_SETTING_KEY, String(Math.min(retailPct, 100000))),
    setAppSettingValue(MIN_WHOLESALE_MARGIN_SETTING_KEY, String(Math.min(wholesalePct, 100000))),
  ]);
}
