import type { ReactNode } from "react";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";
import { FloatingWhatsAppButton } from "@/components/store/floating-whatsapp-button";
import { GoogleTag } from "@/components/store/google-tag";
import { cn } from "@/lib/utils";
import { WEB_ORIGIN_TAG } from "@/lib/site";
import {
  buildStorefrontQuoteWhatsAppHref,
  getSystemBrandName,
  getSystemStorefrontLogoPath,
  getSystemWhatsAppPhoneDisplay,
  getSystemWhatsAppPhoneHref,
} from "@/lib/system-settings";

export default async function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Sin auth(): la sesion y el menu admin los pide el navegador (Navbar), asi la tienda puede ir en cache.
  const [brandName, storefrontLogoPath, whatsAppPhoneDisplay, whatsAppPhoneHref] =
    await Promise.all([
      getSystemBrandName(),
      getSystemStorefrontLogoPath(),
      getSystemWhatsAppPhoneDisplay(),
      getSystemWhatsAppPhoneHref(),
    ]);

  const whatsAppHref = `https://wa.me/${whatsAppPhoneHref}?text=${encodeURIComponent(
    `Hola ${brandName}, vengo de ${WEB_ORIGIN_TAG} y quiero más información.`,
  )}`;
  const floatingWhatsAppHref = await buildStorefrontQuoteWhatsAppHref(brandName);

  return (
    <>
      <GoogleTag />
      <Navbar
        initialUser={null}
        brandName={brandName}
        storefrontLogoPath={storefrontLogoPath}
        whatsAppHref={whatsAppHref}
      />
      <main
        suppressHydrationWarning
        className={cn(
          "mx-auto w-full max-w-6xl px-4 md:px-6",
          "min-h-[calc(100vh-4rem)] pt-3 pb-8 md:pt-4 md:pb-10",
        )}
      >
        {children}
      </main>
      <SiteFooter
        brandName={brandName}
        logoPath={storefrontLogoPath}
        whatsAppHref={whatsAppHref}
        phoneDisplay={whatsAppPhoneDisplay}
        phoneHref={whatsAppPhoneHref}
      />
      <FloatingWhatsAppButton href={floatingWhatsAppHref} />
    </>
  );
}
