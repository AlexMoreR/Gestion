import type { Metadata } from "next";
import Image from "next/image";
import { Palette } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl, getSiteUrl, SALES_LINE_WHATSAPP } from "@/lib/site";
import { getSystemBrandName, getSystemStorefrontLogoPath } from "@/lib/system-settings";
import { agruparCartaPublica } from "@/modules/colores/domain/carta-colores";
import { CartaColores } from "./carta-colores";

// Igual que /cobertura: lo que se agrega u oculta en /admin/colores se ve al instante.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  // El layout raiz agrega "| Marca" (template); aqui va sin marca para no repetirla.
  const pageTitle = "Carta de colores";
  const title = `${pageTitle} | ${brandName}`;
  const description = `Elige el color de cuero o tela de tu mobiliario ${brandName} y escríbenos por WhatsApp.`;
  return {
    title: pageTitle,
    description,
    alternates: { canonical: getSiteUrl("/colores") },
    openGraph: { title, description, url: getSiteUrl("/colores"), siteName: brandName, type: "website", locale: "es_CO" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CartaColoresPage() {
  const [brandName, logoPath, materiales] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    prisma.colorMaterial.findMany({
      where: { oculto: false },
      // Solo lo que usa la carta: la página es pública (nada de createdById ni fechas).
      select: {
        id: true,
        nombre: true,
        grupo: true,
        orden: true,
        oculto: true,
        colores: {
          where: { oculto: false },
          select: { id: true, materialId: true, codigo: true, nombre: true, hex: true, fotoUrl: true, oculto: true, orden: true },
        },
      },
    }),
  ]);

  const grupos = agruparCartaPublica(
    materiales,
    materiales.flatMap((material) => material.colores),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 md:px-6">
          <Image
            src={getPublicAssetUrl(logoPath)}
            alt={brandName}
            width={140}
            height={48}
            className="h-9 w-auto object-contain"
            unoptimized
          />
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
            <Palette className="h-3.5 w-3.5" />
            Carta de colores
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Carta de colores</h1>
          <p className="mt-1 text-sm text-slate-600">
            Toca un color para verlo en grande y escríbenos por WhatsApp para pedirlo con tu mobiliario {brandName}.
          </p>
        </div>

        <CartaColores grupos={grupos} whatsAppPhone={SALES_LINE_WHATSAPP["1"]} />

        <p className="mt-6 text-center text-xs text-slate-400">
          Los colores en pantalla pueden verse un poco distintos al material real.
        </p>
      </main>

      <footer className="mt-8 border-t border-slate-200 bg-slate-900 text-slate-300">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center md:px-6">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} {brandName}. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
