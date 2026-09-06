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

// Numero de WhatsApp por linea de venta (parametro ?ref=). Sin ref (o ref
// desconocido) usa el numero general del sistema.
const REF_WHATSAPP: Record<string, string> = {
  "1": "573169831667", // Ventas 1
  "2": "573205138377", // Ventas 2
};

// Sedes de fabrica que se muestran con mapa de Google al final de la pagina.
const FACTORY_POINTS = [
  {
    title: "Sede principal - Cali",
    address: "Cra. 27 # 72X-25",
    neighborhood: "Omar Torrijos",
    query: "Cra. 27 # 72X-25, Omar Torrijos, Cali, Valle del Cauca, Colombia",
  },
  {
    title: "Bogotá - Cundinamarca",
    address: "Calle 11 # 28-33 Piso 3",
    neighborhood: "El Ricaurte",
    query: "Calle 11 # 28-33, Ricaurte, Bogotá, Colombia",
  },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  const title = `Cobertura de envío gratis | ${brandName}`;
  const description = `Consulta si tu ciudad o corregimiento tiene envío gratis con ${brandName}.`;
  return {
    title,
    description,
    // La imagen de vista previa (og:image) la aporta opengraph-image.tsx.
    openGraph: {
      title,
      description,
      url: "/cobertura",
      siteName: brandName,
      type: "website",
      locale: "es_CO",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ServicioTransportePage({ searchParams }: PageProps) {
  // Carga los datos DANE la primera vez que alguien visita la pagina.
  await ensureTransportSeed();

  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref : "";

  const [brandName, logoPath, systemWhatsAppHref, departments] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    getSystemWhatsAppPhoneHref(),
    listDepartmentOptions(),
  ]);

  // Numero segun la linea de venta del enlace (?ref=1 / ?ref=2).
  const whatsAppHref = REF_WHATSAPP[ref] ?? systemWhatsAppHref;

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

        {/* Puntos de fabrica */}
        <section className="mt-12">
          <h2 className="mb-6 text-center text-xl font-bold tracking-tight text-slate-900">
            Nuestros puntos de fábrica
          </h2>

          <div className="grid gap-6 sm:grid-cols-2">
            {FACTORY_POINTS.map((point) => (
              <div
                key={point.title}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="border-b border-slate-100 px-4 py-3 text-center">
                  <h3 className="text-base font-bold uppercase tracking-wide text-slate-900">{point.title}</h3>
                </div>
                <iframe
                  title={`Mapa ${point.title}`}
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(point.query)}&z=16&output=embed`}
                  className="h-64 w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="space-y-0.5 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-slate-800">Dirección: {point.address}</p>
                  <p className="text-sm text-slate-600">Barrio: {point.neighborhood}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-slate-600">
            Por favor tener en cuenta que somos punto de fábrica en Bogotá y no manejamos mobiliario para exhibición,
            ya que todo se fabrica sobre pedido, según el requerimiento de cada cliente.
          </p>
        </section>
      </main>

      <footer className="mt-8 border-t border-slate-200 bg-slate-900 text-slate-300">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-4 py-8 text-center md:px-6">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} {brandName}. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
