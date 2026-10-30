import type { Metadata } from "next";
import { NotFoundContent } from "@/components/store/not-found-content";
import { buildStorefrontQuoteWhatsAppHref, getSystemBrandName } from "@/lib/system-settings";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false },
};

export default async function StorefrontNotFound() {
  const brandName = await getSystemBrandName();
  const href = await buildStorefrontQuoteWhatsAppHref(brandName);
  return <NotFoundContent whatsAppHref={href} />;
}
