"use client";

import { useEffect } from "react";
import Script from "next/script";
import { datosClicWhatsApp } from "@/lib/whatsapp-click";

// Etiqueta de Google Analytics (gtag.js) de magilus.com, flujo "Magilus web". Solo en páginas públicas.
const GA_ID = "G-6Y4MX98MTJ";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function GoogleTag() {
  // Una sola escucha para toda la página: cuenta cada clic a un enlace de WhatsApp (evento clic_whatsapp).
  // No frena el clic: si Analytics no cargó, el enlace abre igual.
  useEffect(() => {
    function alHacerClic(evento: MouseEvent) {
      try {
        const enlace = (evento.target as Element | null)?.closest?.("a[href]");
        if (!enlace || typeof window.gtag !== "function") return;
        const datos = datosClicWhatsApp(
          enlace.getAttribute("href"),
          enlace.getAttribute("data-cta"),
          enlace.getAttribute("aria-label"),
          enlace.textContent,
          window.location.pathname,
        );
        // beacon: el evento sale aunque el celular cierre la página al abrir la app de WhatsApp.
        if (datos) window.gtag("event", "clic_whatsapp", { ...datos, transport_type: "beacon" });
      } catch {
        // El conteo nunca debe romper el enlace.
      }
    }
    document.addEventListener("click", alHacerClic, true);
    return () => document.removeEventListener("click", alHacerClic, true);
  }, []);

  return (
    <>
      <Script
        id="google-tag-js"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-tag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}

// Al pasar de la tienda al panel sin recargar, la etiqueta seguiría viva y contaría el panel: se recarga una vez limpia.
export function SoltarGoogleTag() {
  useEffect(() => {
    if ("dataLayer" in window) window.location.reload();
  }, []);
  return null;
}
