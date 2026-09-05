import type { Metadata } from "next";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { getPublicAssetUrl } from "@/lib/site";
import {
  getSystemBrandName,
  getSystemStorefrontLogoPath,
  getSystemWhatsAppPhoneHref,
} from "@/lib/system-settings";
import {
  ensureTransportSeed,
  listDepartmentOptions,
} from "@/modules/transporte/infrastructure/transporte-repository";
import { ServiceLookup } from "@/modules/transporte/presentation/service-lookup";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  return {
    title: `Cobertura de envío gratis | ${brandName}`,
    description: `Consulta si tu ciudad o corregimiento tiene envío gratis con ${brandName}.`,
  };
}

export default async function ServicioTransportePage() {
  // Carga los datos DANE la primera vez que alguien visita la pagina.
  await ensureTransportSeed();

  const [brandName, logoPath, whatsAppHref, departments] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    getSystemWhatsAppPhoneHref(),
    listDepartmentOptions(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 md:px-6">
          <Image
            src={getPublicAssetUrl(logoPath)}
            alt={brandName}
            width={140}
            height={48}
            className="h-9 w-auto object-contain"
            unoptimized
          />
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
            <MapPin className="h-3.5 w-3.5" />
            Cobertura de envío
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">¿Tienes envío gratis?</h1>
          <p className="mt-1 text-sm text-slate-600">
            Elige tu ubicación y te decimos al instante si en {brandName} te enviamos <strong>gratis</strong> a tu
            zona.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <ServiceLookup departments={departments} brandName={brandName} whatsAppHref={whatsAppHref} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Cobertura basada en la división oficial de Colombia (DANE). Si no encuentras tu zona, escríbenos y te
          ayudamos.
        </p>
      </main>
    </div>
  );
}
