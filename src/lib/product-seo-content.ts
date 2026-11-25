// Textos SEO fijos por enlace de ficha de producto (tarjetas q5lxmbrr y 1xkd5nop, Search Console nov-2026).
// Si una ficha está aquí, este texto gana sobre el seoTitle/seoDescription que se escriba en
// /admin/productos: para editarlo hay que cambiar este archivo.

import type { CategorySeoSegment } from "./category-seo-content";

export type ProductSeoContent = {
  /** Título en Google sin la marca (el layout le pega "| Magilus"). */
  title: string;
  /** Descripción en Google y en la vista previa al compartir (máx. 155 caracteres). */
  description: string;
  /** H1 propio; sin él, la ficha deja su título de siempre. */
  h1?: string;
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
  "camilla-hidraulica-cav16": {
    title: "Camilla hidráulica de 3 cuerpos para spa y estética",
    description:
      "Camilla hidráulica de 3 cuerpos con espaldar y reposapiés ajustables, para spa, estética y pestañas. Mira fotos y medidas y cotiza por WhatsApp.",
    h1: "Camilla hidráulica de 3 cuerpos",
    paragraph: [
      "La camilla hidráulica de 3 cuerpos de Magilus sube y baja con su sistema hidráulico, así trabajas a la altura correcta y cuidas tu espalda en cada sesión. Su espaldar y su reposapiés son ajustables, para acomodar a cada clienta según el tratamiento. Está tapizada en cuero sintético y se apoya en una base metálica resistente. Es una camilla hidráulica para spa y estética que sirve para faciales, extensiones de pestañas y depilación. Mira las fotos en esta página y compárala con nuestras ",
      { text: "camillas para spa y masaje", href: "/camilla" },
      ", o si te dedicas a las pestañas, con la ",
      { text: "camilla curva para lashista", href: "/camilla/camilla-curva-lashista-cav14" },
      ". Escríbenos por WhatsApp y una asesora te ayuda a elegir.",
    ],
  },
  "mesa-manicura-mmv10": {
    title: "Mesa de manicura con doble esmaltero de fábrica",
    description:
      "Mesa de manicura con doble esmaltero, hecha por Magilus en Cali y Bogotá para salones de uñas. Mira fotos, medidas y precio y cotiza por WhatsApp.",
    paragraph: [
      "La mesa de manicura con doble esmaltero de Magilus está pensada para salones de uñas, spas y manicuristas que quieren trabajar con todo a la mano. Sus dos esmalteros dejan los esmaltes a la vista y ordenados por color, así tu clienta escoge rápido y tú no pierdes tiempo buscando entre cajas. Es una mesa manicura de fábrica: la hacemos en nuestros talleres de Cali y Bogotá y te ayudamos a escoger el color que combine con tu salón. Si buscas una mesa para uñas que se vea profesional desde el primer día, este modelo sirve tanto para montar tu primer puesto como para renovar el que ya tienes. Mira las fotos y las medidas en esta página y compárala con los demás modelos de nuestras ",
      { text: "mesas de manicura", href: "/mesa-manicura" },
      ". Si quieres más espacio para tu colección de colores, combínala con uno de nuestros ",
      { text: "esmalteros", href: "/esmalteros" },
      ". Escríbenos por WhatsApp y una asesora te ayuda a elegir.",
    ],
  },
  "tarima-para-pedicure-tpv01": {
    title: "Tarima para pedicure de 1 puesto con puf, de fábrica",
    description:
      "Tarima para pedicure de 1 puesto con brazos y puf, hecha por Magilus en Cali y Bogotá. Mira fotos, medidas y precio y cotiza por WhatsApp.",
    h1: "Tarima para pedicure de 1 puesto con puf",
    paragraph: [
      "La tarima para pedicure de 1 puesto de Magilus está pensada para salones de uñas, spas y pedicuristas que quieren ofrecer un servicio cómodo y con buena imagen. Tu clienta se sienta en un puesto con brazos, bien apoyada y relajada mientras le atienden los pies, y la pedicurista trabaja sentada en el puf, a la altura de los pies, sin forzar la espalda. Es una tarima de pedicure de fábrica: la hacemos en nuestros talleres de Cali y Bogotá y tú escoges el color que combine con tu salón. Mira las fotos y las medidas en esta página y compárala con las demás ",
      { text: "tarimas para pedicure", href: "/tarimas-pedicure" },
      "; si necesitas más asientos para tu equipo, revisa también nuestros ",
      { text: "butacos mani y pedy", href: "/butacos-mani-y-pedy" },
      ". Escríbenos por WhatsApp y una asesora te ayuda a elegir.",
    ],
  },
};

export function getProductSeoContent(slug: string | null | undefined): ProductSeoContent | null {
  const key = slug?.trim() ?? "";
  return Object.hasOwn(PRODUCT_SEO_CONTENT, key) ? PRODUCT_SEO_CONTENT[key] : null;
}
