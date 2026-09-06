import Link from "next/link";
import Image from "next/image";
import { Facebook, Instagram, MessageCircle, Phone } from "lucide-react";
import { getPublicAssetUrl, siteConfig } from "@/lib/site";
import { LEGAL_LINKS } from "@/lib/legal-docs";

type SiteFooterProps = {
  brandName: string;
  logoPath: string;
  whatsAppHref: string; // URL completa de WhatsApp
  phoneDisplay: string;
  phoneHref: string; // ej. +573046481994
};

const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/magilus.co?igsh=MWc5aHV4Nnc1enJpbg==",
    icon: Instagram,
  },
  { label: "Facebook", href: "https://www.facebook.com/share/1C7NgCJa1q/", icon: Facebook },
];

const NAV_LINKS = [
  { label: "Inicio", href: "/" },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Cobertura de envío", href: "/cobertura" },
  { label: "Precios al por mayor", href: "/distribuidor" },
];

export function SiteFooter({ brandName, logoPath, whatsAppHref, phoneDisplay, phoneHref }: SiteFooterProps) {
  return (
    <footer className="bg-[var(--primary)] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Marca */}
          <div className="space-y-4">
            <Image
              src={getPublicAssetUrl(logoPath)}
              alt={brandName}
              width={200}
              height={56}
              className="h-11 w-auto object-contain"
              unoptimized
            />
            <p className="max-w-xs text-sm leading-relaxed text-white/75">{siteConfig.description}</p>
            <div className="flex items-center gap-2">
              {SOCIAL_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Navegacion */}
          <nav className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/90">Navegación</h3>
            <ul className="space-y-2">
              {NAV_LINKS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-white/75 transition hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contacto */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/90">Atención al cliente</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href={whatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/75 transition hover:text-white"
                >
                  <MessageCircle className="h-4 w-4" /> Escríbenos por WhatsApp
                </Link>
              </li>
              <li>
                <a
                  href={`tel:${phoneHref}`}
                  className="inline-flex items-center gap-2 text-sm text-white/75 transition hover:text-white"
                >
                  <Phone className="h-4 w-4" /> {phoneDisplay}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <nav className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/90">Legal</h3>
            <ul className="space-y-2">
              {LEGAL_LINKS.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/legal/${item.slug}`}
                    className="text-sm text-white/75 transition hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-white/15 pt-6 text-center text-xs text-white/60">
          © {new Date().getFullYear()} {brandName}. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
