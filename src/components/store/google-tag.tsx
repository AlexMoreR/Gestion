"use client";

import { useEffect } from "react";
import Script from "next/script";

// Etiqueta de Google Analytics (gtag.js) de magilus.com, flujo "Magilus web". Solo en páginas públicas.
const GA_ID = "G-6Y4MX98MTJ";

export function GoogleTag() {
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
