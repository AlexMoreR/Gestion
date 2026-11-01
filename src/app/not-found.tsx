import type { Metadata } from "next";
import { NotFoundContent } from "@/components/store/not-found-content";
import { buildStorefrontQuoteWhatsAppHref, getSystemBrandName } from "@/lib/system-settings";

// 404 de la raiz: direcciones que no pasan por la tienda (ej. /a/b/c). Sin menu ni pie, porque el
// layout raiz no los tiene y necesitan la sesion y la carga del layout de la tienda.
export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false },
};

export default async function RootNotFound() {
  const brandName = await getSystemBrandName();
  const href = await buildStorefrontQuoteWhatsAppHref(brandName);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <NotFoundContent whatsAppHref={href} />
    </main>
  );
}
