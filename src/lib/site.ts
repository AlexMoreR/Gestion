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
  ogImagePath: "/magilus-logo-m.svg",
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

export function buildWhatsAppProductHref(productName: string, brandName: string = siteConfig.name): string {
  return buildWhatsAppHref(`Hola ${brandName}, quiero comprar el producto: ${productName}`);
}

export function sanitizeDescription(value: string | null | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}
