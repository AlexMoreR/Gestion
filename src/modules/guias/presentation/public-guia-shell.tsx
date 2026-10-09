import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowLeft, PackageSearch } from "lucide-react";
import { getPublicAssetUrl } from "@/lib/site";
import {
  getSystemBrandName,
  getSystemStorefrontLogoPath,
  getSystemWhatsAppPhoneDisplay,
  getSystemWhatsAppPhoneHref,
} from "@/lib/system-settings";
import type { DocumentShipmentView } from "../domain/document-view";
import type { PublicShipmentView } from "../domain/public-view";
import { PrintButton } from "./print-button";
import { PublicLookup } from "./public-lookup";
import { GuideTitle, WaybillDocument } from "./waybill-document";

// Paginas publicas de la guia (cabecera Magilus + contenido).
// - PublicGuiaShell: "Estado del envio". La usan /guia (formulario) y /guia/[token] (enlace
//   directo: llega con la guia ya resuelta o con un aviso).
// - PublicGuiaDocumentShell: "Guia" (documento formal) en /guia/[token]/documento.

async function loadBrand() {
  const [brandName, logoPath, whatsAppDigits, whatsAppDisplay] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    getSystemWhatsAppPhoneHref(),
    getSystemWhatsAppPhoneDisplay(),
  ]);
  return { brandName, logoUrl: getPublicAssetUrl(logoPath), whatsAppDigits, whatsAppDisplay };
}

function GuiaFrame({
  brandName,
  logoUrl,
  badge,
  children,
}: {
  brandName: string;
  logoUrl: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#e9eaef] print:min-h-0 print:bg-white">
      {/* La cabecera morada no sale al imprimir: solo queda el documento. */}
      <header className="border-b-2 border-[#2d0049] bg-[#42066E] print:hidden">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-4 py-4">
          <Image src={logoUrl} alt={brandName} width={140} height={48} className="h-9 w-auto object-contain" unoptimized />
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
            <PackageSearch className="h-3.5 w-3.5" />
            {badge}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

export async function PublicGuiaShell({
  initialView,
  initialNotice,
}: {
  initialView?: PublicShipmentView | null;
  initialNotice?: string;
}) {
  const { brandName, logoUrl, whatsAppDigits } = await loadBrand();

  return (
    <GuiaFrame brandName={brandName} logoUrl={logoUrl} badge="Rastreo de envíos">
      {/* Ancho de la hoja de la guia en computador (~1048 px utiles); el formulario y el boton de
          WhatsApp se quedan angostos (max-w-xl) dentro de PublicLookup. */}
      <main className="mx-auto w-full max-w-[1080px] px-4 py-8">
        {/* El titulo "Consulte su envío" vive en PublicLookup para ocultarlo cuando se muestra la guia. */}
        <PublicLookup
          whatsAppHref={`https://wa.me/${whatsAppDigits}`}
          logoUrl={logoUrl}
          brandName={brandName}
          initialView={initialView}
          initialNotice={initialNotice}
        />
        <p className="mt-6 text-center text-xs text-slate-400">Envíos desde nuestra fábrica en Bogotá.</p>
      </main>
    </GuiaFrame>
  );
}

// Al imprimir: hoja blanca (carta o A4, la que elija el navegador), margenes comodos y sin
// sombras ni botones. El documento ocupa todo el ancho util de la hoja.
const PRINT_CSS = `
@media print {
  @page { margin: 12mm; }
  html, body { background: #fff !important; }
}
`;

export async function PublicGuiaDocumentShell({ view, token }: { view: DocumentShipmentView; token: string }) {
  const { brandName, logoUrl, whatsAppDisplay } = await loadBrand();
  const statusHref = `/guia/${encodeURIComponent(token)}`;

  return (
    <GuiaFrame brandName={brandName} logoUrl={logoUrl} badge="Guía de envío">
      <style>{PRINT_CSS}</style>
      <main className="mx-auto w-full max-w-[880px] px-4 py-6 sm:py-8 print:max-w-none print:p-0">
        <article className="overflow-hidden rounded-[10px] border border-[#d7d7de] bg-white text-[#1f2430] shadow-[0_6px_24px_rgba(0,0,0,0.08)] print:rounded-none print:border-0 print:shadow-none">
          <GuideTitle code={view.code} logoUrl={logoUrl} brandName={brandName} />
          <div className="p-4 sm:p-[22px] print:px-0">
            <WaybillDocument view={view} logoUrl={logoUrl} brandName={brandName} whatsAppDisplay={whatsAppDisplay} />
          </div>
        </article>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center print:hidden">
          <PrintButton />
          <a
            href={statusHref}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#42066E] bg-white px-5 text-base font-semibold text-[#42066E] sm:w-auto"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden /> Ver estado del envío
          </a>
        </div>
      </main>
    </GuiaFrame>
  );
}
