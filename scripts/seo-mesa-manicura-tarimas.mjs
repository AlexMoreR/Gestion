// Cambio de UNA SOLA VEZ (nov-2026): título y descripción en Google de 2 categorías (mesas de
// manicura y tarimas de pedicure). Solo los campos `seoTitle` y `seoDescription`: nunca nombre,
// enlace (slug), descripción, logo ni productos.
//
// Parte 1: solo la tabla y la regla pura (sin conexión a la base). La parte 2 agrega main(), que por
// defecto SOLO SIMULA y escribe unicamente con --aplicar --tarjeta T-xxx (transaccion + firma).

// Tabla fija. El título va SIN " | Magilus": lo pega src/app/layout.tsx.
export const TEXTOS_SEO = [
  {
    slug: "mesa-manicura",
    seoTitle: "Mesa de manicura de fábrica, envío a toda Colombia",
    seoDescription:
      "Mesas de manicura fabricadas por Magilus en Cali y Bogotá. Envío a toda Colombia y garantía de 1 año. Mira modelos y precios y cotiza por WhatsApp.",
  },
  {
    slug: "tarimas-pedicure",
    seoTitle: "Tarimas pedicure de fábrica, envío a toda Colombia",
    seoDescription:
      "Tarimas de pedicure fabricadas por Magilus en Cali y Bogotá. Envío a toda Colombia y garantía de 1 año. Mira modelos y precios y cotiza por WhatsApp.",
  },
];

const limpio = (texto) => String(texto ?? "").trim();

/**
 * Regla pura: con las categorías de hoy ({ id, slug, seoTitle, seoDescription }) dice qué cambia y
 * qué se salta. Reemplaza lo que haya (aunque esté vacío o escrito a mano) salvo que ya tenga los dos
 * textos nuevos.
 */
export function planearSeo(categorias) {
  const cambios = [];
  const saltados = [];
  for (const { slug, seoTitle, seoDescription } of TEXTOS_SEO) {
    const categoria = categorias.find((c) => c.slug === slug);
    if (!categoria) {
      saltados.push({ slug, motivo: "no existe ese enlace" });
      continue;
    }
    const antes = { seoTitle: limpio(categoria.seoTitle), seoDescription: limpio(categoria.seoDescription) };
    if (antes.seoTitle === seoTitle && antes.seoDescription === seoDescription) {
      saltados.push({ slug, motivo: "ya tiene los textos nuevos" });
      continue;
    }
    cambios.push({ id: categoria.id, slug, antes, despues: { seoTitle, seoDescription } });
  }
  return { cambios, saltados };
}

/** Lineas que se imprimen: título y descripción "antes" → "después" y los saltados con su motivo. */
export function lineasDelPlan({ cambios, saltados }, aplicar) {
  return [
    aplicar ? "APLICAR: se escriben los textos nuevos." : "SIMULACION: no se escribe nada (usa --aplicar --tarjeta T-xxx).",
    ...cambios.flatMap((c) => [
      `  ${c.slug}: título "${c.antes.seoTitle}" → "${c.despues.seoTitle}"`,
      `  ${c.slug}: descripción "${c.antes.seoDescription}" → "${c.despues.seoDescription}"`,
    ]),
    ...saltados.map((s) => `  ${s.slug}: se salta, ${s.motivo}`),
  ];
}
