const CANONICAL_SITE_URL = "https://magilus.com";

function normalizeSiteDomain(value: string | undefined): string {
  const fallback = CANONICAL_SITE_URL;
  const normalizedValue = value?.trim().replace(/\/+$/, "");

  if (!normalizedValue) {
    return fallback;
  }

  try {
    const parsed = new URL(normalizedValue);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "www.magilus.com" || hostname === "magilus.com.co" || hostname === "www.magilus.com.co") {
      return fallback;
    }

    return parsed.origin;
  } catch {
    return fallback;
  }
}

export const siteConfig = {
  name: "Magilus",
  legalName: "Magilus",
  description:
    "Magilus ofrece sillas barberas e hidráulicas, camillas, tocadores, salas de espera y mobiliario profesional para peluquería, barbería y salón de belleza, con envíos a Colombia (consulta tu ciudad).",
  domain: normalizeSiteDomain(process.env.NEXT_PUBLIC_SITE_URL),
  phoneDisplay: "+57 304 648 1994",
  phoneHref: "+573046481994",
  whatsappHref:
    "https://wa.me/573046481994?text=Hola%20Magilus%2C%20quiero%20cotizar%20mobiliario%20profesional",
  logoPath: "/magilus-logo-m.svg",
  // PNG 1200x630 generado por src/app/opengraph-image.tsx (WhatsApp y Facebook no muestran SVG).
  ogImagePath: "/opengraph-image",
  country: "CO",
  locale: "es_CO",
  coreKeywords: [
    "magilus",
    "sillas para salón de belleza",
    "estaciones de belleza",
    "mobiliario para barbería",
    "mobiliario profesional para salón",
    "muebles para peluquería",
    "sillas de barbería premium",
    "catálogo mobiliario de belleza",
  ],
} as const;

// Numero de WhatsApp por linea de venta (?ref= de /cobertura).
export const SALES_LINE_WHATSAPP: Record<string, string> = {
  "1": "573169831667", // Ventas 1
  "2": "573205138377", // Ventas 2
};

export function getSiteUrl(path = ""): string {
  return new URL(path, `${siteConfig.domain}/`).toString();
}

export function getPublicAssetUrl(path = ""): string {
  const normalizedPath = path.trim();

  if (!normalizedPath) {
    return getSiteUrl("/");
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  const relativePath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;

  // En desarrollo los archivos subidos viven en el `public/` local, no en el
  // dominio de produccion. Devolver la ruta relativa hace que la imagen se
  // sirva desde el origen actual (localhost) y evita la imagen rota.
  if (process.env.NODE_ENV !== "production") {
    return relativePath;
  }

  return getSiteUrl(relativePath);
}

// Marca fija en el primer mensaje de los chats que vienen de la tienda web: el CRM y las
// asesoras cuentan las ventas por SEO buscando este texto. No cambiar sin avisar al CRM.
export const WEB_ORIGIN_TAG = "magilus.com";

// Mensaje de "Comprar por WhatsApp" (corto, sin precio ni enlace):
//   Hola, vengo de magilus.com 👋
//   Me interesa la *Camilla Hidraulica* (CAV016)
// El nombre va con mayuscula inicial por palabra, tal como esta guardado (sin agregar tildes).
// brandName se conserva en la firma para no cambiar a quien llama.
export function buildWhatsAppBuyMessage(
  _brandName: string,
  productName: string,
  productCode?: string | null,
): string {
  const code = productCode?.trim();
  const name = productName
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => space + letter.toUpperCase());
  return `Hola, vengo de ${WEB_ORIGIN_TAG} 👋\nMe interesa la *${name}*${code ? ` (${code})` : ""}`;
}

// Mensaje de "Cotiza aquí" y botones generales de la tienda:
//   Hola Marca, vengo de magilus.com y quiero cotizar mobiliario profesional
//   Hola Marca, vengo de magilus.com (Camillas) y quiero cotizar mobiliario profesional
export function buildWhatsAppQuoteMessage(brandName: string, pageLabel?: string | null): string {
  const label = pageLabel?.replace(/\s+/g, " ").trim();
  return `Hola ${brandName}, vengo de ${WEB_ORIGIN_TAG}${label ? ` (${label})` : ""} y quiero cotizar mobiliario profesional`;
}

export function sanitizeDescription(value: string | null | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}
