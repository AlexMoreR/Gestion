import type { Metadata } from "next";
import Image from "next/image";
import { PackageSearch } from "lucide-react";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemBrandName, getSystemStorefrontLogoPath, getSystemWhatsAppPhoneHref } from "@/lib/system-settings";
import { PublicLookup } from "@/modules/guias/presentation/public-lookup";

// Consulta publica de la guia Magilus: guia MG + ultimos 4 del celular (por POST, sin datos en
// la URL). El resultado lo arma shipment-lookup.ts y nunca trae transportadora, guia del
// proveedor, telefono ni direccion.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  return {
    title: `Consulta tu guía | ${brandName}`,
    description: `Revisa cómo va tu pedido ${brandName} con tu número de guía.`,
    robots: { index: false, follow: false },
  };
}

export default async function GuiaPublicPage() {
  const [brandName, logoPath, whatsAppDigits] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    getSystemWhatsAppPhoneHref(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b-2 border-[#2d0049] bg-[#42066E]">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-4">
          <Image
            src={getPublicAssetUrl(logoPath)}
            alt={brandName}
            width={140}
            height={48}
            className="h-9 w-auto object-contain"
            unoptimized
          />
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
            <PackageSearch className="h-3.5 w-3.5" />
            Rastreo de envíos
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Consulte su envío</h1>
          <p className="mt-1 text-sm text-slate-600">
            Escribe tu número de guía {brandName} (empieza por MG) y los últimos 4 dígitos de tu celular.
          </p>
        </div>
        <PublicLookup whatsAppHref={`https://wa.me/${whatsAppDigits}`} brandName={brandName} />
        <p className="mt-6 text-center text-xs text-slate-400">Envíos desde nuestra fábrica en Bogotá.</p>
      </main>
    </div>
  );
}
