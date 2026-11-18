// Textos SEO fijos por enlace de ficha de producto (tarjeta q5lxmbrr, Search Console nov-2026).
// Si una ficha está aquí, este texto gana sobre el seoTitle/seoDescription que se escriba en
// /admin/productos: para editarlo hay que cambiar este archivo.

import type { CategorySeoSegment } from "./category-seo-content";

export type ProductSeoContent = {
  /** Título en Google sin la marca (el layout le pega "| Magilus"). */
  title: string;
  /** Descripción en Google y en la vista previa al compartir (máx. 155 caracteres). */
  description: string;
  h1: string;
  /** Párrafo de arriba de "Medidas y detalles"; un segmento con href es un enlace interno. */
  paragraph: CategorySeoSegment[];
};

const PRODUCT_SEO_CONTENT: Record<string, ProductSeoContent> = {
  "camilla-fija-de-madera-con-cajones-cav11": {
    title: "Camilla fija de madera con cajones para masajes",
    description:
      "Camilla fija de madera con cajones, hecha por Magilus en Cali y Bogotá para spa, masajes y estética. Mira fotos, medidas y precio y cotiza por WhatsApp.",
    h1: "Camilla fija de madera con cajones para masajes",
    paragraph: [
      "En Magilus fabricamos esta camilla fija de madera con cajones en nuestros talleres de Cali y Bogotá, pensada para spas, cabinas de masaje, centros de estética y profesionales independientes. Es una camilla de madera firme y estable: como no se pliega, se queda en su lugar sesión tras sesión y le da a tu cabina una imagen sólida y profesional. Como camilla fija para masajes, te deja trabajar con comodidad en masajes relajantes, tratamientos faciales y corporales, depilación o limpieza facial. Y por ser una camilla con cajones, tienes a la mano toallas, aceites, cremas y herramientas sin necesidad de un mueble extra, algo que se agradece en las cabinas pequeñas. Abajo encuentras las fotos y las medidas. Si quieres comparar con otros modelos, mira todas nuestras ",
      { text: "camillas para spa y masaje", href: "/camilla" },
      ". Escríbenos por WhatsApp y te asesoramos para escoger la camilla ideal para tu trabajo.",
    ],
  },
};

export function getProductSeoContent(slug: string | null | undefined): ProductSeoContent | null {
  const key = slug?.trim() ?? "";
  return Object.hasOwn(PRODUCT_SEO_CONTENT, key) ? PRODUCT_SEO_CONTENT[key] : null;
}
