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
    "Magilus ofrece sillas barberas e hidráulicas, camillas, tocadores, salas de espera y mobiliario profesional para peluquería, barbería y salón de belleza, con envío a toda Colombia.",
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

export function buildWhatsAppHref(message: string): string {
  return `https://wa.me/${siteConfig.phoneHref.replace("+", "")}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppCatalogHref(brandName: string): string {
  return buildWhatsAppHref(`Hola ${brandName}, quiero cotizar mobiliario profesional`);
}

// Marca fija en el primer mensaje de los chats que vienen de la tienda web: el CRM y las
// asesoras cuentan las ventas por SEO buscando este texto. No cambiar sin avisar al CRM.
export const WEB_ORIGIN_TAG = "magilus.com";

// Mensaje de "Comprar por WhatsApp":
//   Hola *Marca*, vengo de magilus.com y quiero comprar:
//   *CODIGO* Producto ($precio)
//   https://magilus.com/<categoria>/<producto>
// (los * son negrita en WhatsApp). Si el producto no tiene codigo, solo el nombre; precio y
// enlace solo si se pasan.
export function buildWhatsAppBuyMessage(
  brandName: string,
  productName: string,
  productCode?: string | null,
  origin?: { pageUrl?: string | null; priceLabel?: string | null },
): string {
  const code = productCode?.trim();
  const name = productName.replace(/\s+/g, " ").trim();
  const price = origin?.priceLabel?.trim();
  const pageUrl = origin?.pageUrl?.trim();
  const reference = `${code ? `*${code}* ${name}` : name}${price ? ` (${price})` : ""}`;
  const lines = [`Hola *${brandName}*, vengo de ${WEB_ORIGIN_TAG} y quiero comprar:`, reference];
  if (pageUrl) {
    lines.push(pageUrl);
  }
  return lines.join("\n");
}

// Mensaje de "Cotiza aquí" y botones generales de la tienda:
//   Hola Marca, vengo de magilus.com y quiero cotizar mobiliario profesional
//   Hola Marca, vengo de magilus.com (Camillas) y quiero cotizar mobiliario profesional
export function buildWhatsAppQuoteMessage(brandName: string, pageLabel?: string | null): string {
  const label = pageLabel?.replace(/\s+/g, " ").trim();
  return `Hola ${brandName}, vengo de ${WEB_ORIGIN_TAG}${label ? ` (${label})` : ""} y quiero cotizar mobiliario profesional`;
}

export function buildWhatsAppProductHref(
  productName: string,
  brandName: string = siteConfig.name,
  productCode?: string | null,
): string {
  return buildWhatsAppHref(buildWhatsAppBuyMessage(brandName, productName, productCode));
}

export function sanitizeDescription(value: string | null | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}
