import Image from "next/image";
import { PackageSearch } from "lucide-react";
import { getPublicAssetUrl } from "@/lib/site";
import {
  getSystemBrandName,
  getSystemStorefrontLogoPath,
  getSystemWhatsAppPhoneDisplay,
  getSystemWhatsAppPhoneHref,
} from "@/lib/system-settings";
import type { PublicShipmentView } from "../domain/public-view";
import { PublicLookup } from "./public-lookup";

// Pagina publica de la guia (cabecera Magilus + consulta). La usan /guia (formulario) y
// /guia/[token] (enlace directo: llega con la guia ya resuelta o con un aviso).
export async function PublicGuiaShell({
  initialView,
  initialNotice,
}: {
  initialView?: PublicShipmentView | null;
  initialNotice?: string;
}) {
  const [brandName, logoPath, whatsAppDigits, whatsAppDisplay] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    getSystemWhatsAppPhoneHref(),
    getSystemWhatsAppPhoneDisplay(),
  ]);
  const logoUrl = getPublicAssetUrl(logoPath);

  return (
    <div className="min-h-screen bg-[#e9eaef]">
      <header className="border-b-2 border-[#2d0049] bg-[#42066E]">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-4 py-4">
          <Image
            src={logoUrl}
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

      {/* Ancho de la hoja de la guia en computador (~1048 px utiles); el formulario y el boton de
          WhatsApp se quedan angostos (max-w-xl) dentro de PublicLookup. */}
      <main className="mx-auto w-full max-w-[1080px] px-4 py-8">
        {/* El titulo "Consulte su envío" vive en PublicLookup para ocultarlo cuando se muestra la guia. */}
        <PublicLookup
          whatsAppHref={`https://wa.me/${whatsAppDigits}`}
          whatsAppDisplay={whatsAppDisplay}
          logoUrl={logoUrl}
          brandName={brandName}
          initialView={initialView}
          initialNotice={initialNotice}
        />
        <p className="mt-6 text-center text-xs text-slate-400">Envíos desde nuestra fábrica en Bogotá.</p>
      </main>
    </div>
  );
}
