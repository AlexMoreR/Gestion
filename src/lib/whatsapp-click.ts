// Datos del evento clic_whatsapp de Analytics: qué botón de WhatsApp se tocó y en qué página.
// Nunca manda el texto del mensaje ni la parte "?…" de la ruta (nada personal).
export function datosClicWhatsApp(
  href: string | null | undefined,
  cta: string | null | undefined,
  ariaLabel: string | null | undefined,
  texto: string | null | undefined,
  ruta: string,
): { ubicacion: string; pagina: string } | null {
  if (!href || !/(^|[/.])(wa\.me|api\.whatsapp\.com)\//i.test(href)) return null;
  const ubicacion = [cta, ariaLabel, texto]
    .map((valor) => (valor ?? "").replace(/\s+/g, " ").trim())
    .find(Boolean);
  return {
    ubicacion: (ubicacion ?? "sin_nombre").slice(0, 40),
    pagina: ruta.split(/[?#]/)[0] || "/",
  };
}
