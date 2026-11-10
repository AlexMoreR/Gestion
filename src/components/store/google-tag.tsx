"use client";

import { useEffect } from "react";
import Script from "next/script";

// Etiqueta de Google (Analytics vía Tag Manager) que dio Google para magilus.com. Solo en páginas públicas.
export function GoogleTag() {
  return (
    <>
      <Script id="google-tag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
// Sin este evento el contenedor de Tag Manager carga pero no dispara "Todas las páginas".
window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });`}
      </Script>
      <Script
        id="google-tag-js"
        src="https://www.googletagmanager.com/gtm.js?id=GTM-KN87Z2HC"
        strategy="afterInteractive"
      />
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
