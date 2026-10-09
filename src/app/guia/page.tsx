import type { Metadata } from "next";
import { getSystemBrandName } from "@/lib/system-settings";
import { PublicGuiaShell } from "@/modules/guias/presentation/public-guia-shell";

// Consulta publica de la guia Magilus: guia MG + ultimos 4 del celular (por POST, sin datos en
// la URL). El resultado lo arma shipment-lookup.ts y nunca trae transportadora, guia del
// proveedor, telefono ni direccion. El enlace directo con un clic vive en /guia/[token].

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  return {
    title: `Consulta tu guía | ${brandName}`,
    description: `Revisa cómo va tu pedido ${brandName} con tu número de guía.`,
    robots: { index: false, follow: false },
  };
}

export default function GuiaPublicPage() {
  return <PublicGuiaShell />;
}
