import type { Metadata } from "next";
import { getSystemBrandName } from "@/lib/system-settings";
import { LOOKUP_BLOCKED_ERROR } from "@/modules/guias/domain/lookup";
import {
  currentRequestIpHash,
  lookupShipmentByLinkToken,
  type PublicShipmentView,
} from "@/modules/guias/infrastructure/shipment-lookup";
import { PublicGuiaDocumentShell, PublicGuiaShell } from "@/modules/guias/presentation/public-guia-shell";

// Documento formal de la guia (magilus.com/guia/<codigo>.<firma>/documento): el recuadro tipo
// comprobante, para ver, imprimir o guardar en PDF. Mismo token firmado, misma vista publica y
// mismo limite por IP que el enlace directo (/guia/[token]). Si el enlace no sirve, formulario.

export const dynamic = "force-dynamic";

const INVALID_LINK_NOTICE =
  "Este enlace no es válido o ya no está activo. Escribe tu número de guía y los últimos 4 dígitos de tu celular.";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  return {
    title: `Guía de envío | ${brandName}`,
    robots: { index: false, follow: false },
    // El token no debe salir por Referer hacia otros sitios.
    referrer: "no-referrer",
  };
}

export default async function GuiaDocumentPage({ params }: PageProps) {
  const { token } = await params;
  let view: PublicShipmentView | null = null;
  let notice = INVALID_LINK_NOTICE;
  try {
    const outcome = await lookupShipmentByLinkToken({ token, ipHash: await currentRequestIpHash() });
    if (outcome.ok) {
      view = outcome.view;
    } else if (outcome.reason === "BLOCKED") {
      notice = LOOKUP_BLOCKED_ERROR;
    }
  } catch (error) {
    console.error("[guias] Fallo el documento de la guia:", error);
    notice = "No pudimos abrir la guía. Escribe tu número de guía y los últimos 4 dígitos de tu celular.";
  }
  return view ? <PublicGuiaDocumentShell view={view} token={token} /> : <PublicGuiaShell initialNotice={notice} />;
}
