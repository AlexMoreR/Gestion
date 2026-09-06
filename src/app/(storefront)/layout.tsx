import type { ReactNode } from "react";
import { auth } from "@/auth";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import { getAdminModuleAccess } from "@/lib/admin-module-access";
import {
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
  const session = await auth();
  const [brandName, storefrontLogoPath, adminModuleAccess, whatsAppPhoneDisplay, whatsAppPhoneHref] =
    await Promise.all([
      getSystemBrandName(),
      getSystemStorefrontLogoPath(),
      getAdminModuleAccess(session?.user?.id, session?.user?.role),
      getSystemWhatsAppPhoneDisplay(),
      getSystemWhatsAppPhoneHref(),
    ]);

  const whatsAppHref = `https://wa.me/${whatsAppPhoneHref}?text=${encodeURIComponent(
    `Hola ${brandName}, quiero más información.`,
  )}`;

  return (
    <>
      <Navbar
        initialUser={session?.user ?? null}
        brandName={brandName}
        storefrontLogoPath={storefrontLogoPath}
        adminModuleAccess={adminModuleAccess}
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
    </>
  );
}
