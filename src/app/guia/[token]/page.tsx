import type { Metadata } from "next";
import { getSystemBrandName } from "@/lib/system-settings";
import { LOOKUP_BLOCKED_ERROR } from "@/modules/guias/domain/lookup";
import {
  currentRequestIpHash,
  lookupShipmentByLinkToken,
  type PublicShipmentView,
} from "@/modules/guias/infrastructure/shipment-lookup";
import { PublicGuiaShell } from "@/modules/guias/presentation/public-guia-shell";

// Enlace directo de la guia (magilus.com/guia/<codigo>.<firma>): un clic y el cliente ve su guia,
// sin escribir los 4 digitos. La firma es HMAC del id con AUTH_SECRET (src/lib/shipment-link-token.ts);
// la vista es la misma de la consulta publica (shipment-lookup.ts): sin telefono completo,
// direccion, transportadora ni guia del proveedor. Si el enlace no sirve, se muestra el formulario.

export const dynamic = "force-dynamic";

const INVALID_LINK_NOTICE =
  "Este enlace no es válido o ya no está activo. Escribe tu número de guía y los últimos 4 dígitos de tu celular.";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const brandName = await getSystemBrandName();
  return {
    title: `Tu guía | ${brandName}`,
    robots: { index: false, follow: false },
    // El token no debe salir por Referer hacia otros sitios (WhatsApp, imagenes).
    referrer: "no-referrer",
  };
}

export default async function GuiaDirectLinkPage({ params }: PageProps) {
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
    console.error("[guias] Fallo el enlace directo:", error);
    notice = "No pudimos abrir la guía. Escribe tu número de guía y los últimos 4 dígitos de tu celular.";
  }
  return view ? <PublicGuiaShell initialView={view} /> : <PublicGuiaShell initialNotice={notice} />;
}
