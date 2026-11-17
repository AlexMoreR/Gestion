// Textos SEO fijos por enlace de categoría (tarjeta vjcys1pt, Search Console nov-2026).
// Si una categoría está aquí, este texto gana sobre el seoTitle/seoDescription/descripción
// que se escriba en /admin/categorias: para editarlo hay que cambiar este archivo.

export type CategorySeoSegment = string | { text: string; href: string };

export type CategorySeoContent = {
  /** Título completo en Google (se usa como `absolute`, ya trae la marca). */
  title: string;
  /** Descripción en Google y en la vista previa al compartir (máx. 155 caracteres). */
  description: string;
  h1: string;
  /** Párrafos de arriba de los productos; un segmento con href es un enlace interno. */
  paragraphs: CategorySeoSegment[][];
  /** Se agrega al nombre del producto en el ALT de cada foto. */
  altSuffix: string;
};

const CATEGORY_SEO_CONTENT: Record<string, CategorySeoContent> = {
  esmalteros: {
    title: "Esmalteros para uñas en madera | Fabricantes | Magilus",
    description:
      "Esmalteros para uñas en madera: de pared, de pie y con cajones. Fabricantes en Cali y Bogotá, envío a toda Colombia y garantía de 1 año.",
    h1: "Esmalteros para salón de uñas",
    paragraphs: [
      [
        "En Magilus somos fabricantes de esmalteros en madera para salones de uñas, spas y manicuristas independientes. Un esmaltero bien ubicado mantiene los esmaltes a la vista, ordenados por color y al alcance de la mano mientras atiendes a tu clienta, y le da a tu salón una imagen limpia y profesional.",
      ],
      [
        "Hacemos varios tipos: el esmaltero de pared, que ahorra espacio y convierte una pared en vitrina de colores; el esmaltero de pie, que puedes mover donde lo necesites; y el esmaltero con cajones, que además guarda limas, removedor y herramientas. Todos funcionan como organizador de esmaltes y se fabrican en madera en Cali y Bogotá.",
      ],
      [
        "Enviamos a toda Colombia y cada esmaltero tiene garantía de 1 año. Si estás armando tu salón, combínalo con una ",
        { text: "mesa de manicura", href: "/mesa-manicura" },
        " y una ",
        { text: "tarima de pedicure", href: "/tarimas-pedicure" },
        " para tener todo el puesto de trabajo a juego. Escríbenos por WhatsApp y te asesoramos en el modelo, el tamaño y el color.",
      ],
    ],
    altSuffix: "organizador de esmaltes para salón de uñas",
  },
  "lavacabezas-fibra-de-vidrio": {
    title: "Lavacabezas en fibra de vidrio | Fabricantes | Magilus",
    description:
      "Lavacabezas en fibra de vidrio para peluquería y barbería: Milenio, Italo Eco, Fredy, Ponti y más. Fabricantes de mobiliario en Cali y Bogotá.",
    h1: "Lavacabezas en fibra de vidrio para peluquería",
    paragraphs: [
      [
        "En Magilus somos fabricantes de lavacabezas en fibra de vidrio para peluquerías, barberías y salones de belleza. Un buen lavacabezas para peluquería le da comodidad a tu clienta mientras le lavas el cabello, te deja trabajar en una postura más cómoda y hace que el puesto de lavado se vea limpio y profesional. La fibra de vidrio es liviana, resistente y fácil de limpiar todos los días.",
      ],
      [
        "Tenemos varios modelos para escoger: el Milenio, en versión Corazón y Master, ideal para salones que empiezan; el Italo Eco; el Fredy, también con brazo de platina; el Ponti con brazos redondeados; el lavacabezas capitoneado en negro, y el lavacabezas con poceta de vidrio, para un puesto de lavado más elegante. Cada lavacabezas en fibra de vidrio se fabrica en nuestros talleres de Cali y Bogotá, y te ayudamos a escoger el color que combine con tu salón.",
      ],
      [
        "Si estás buscando lavacabezas Cali o en cualquier ciudad de Colombia, cuéntanos cómo es tu espacio y cuántos puestos de lavado necesitas. Si prefieres una poceta más pesada y brillante, mira también nuestros ",
        { text: "lavacabezas en porcelana", href: "/lavacabezas-en-porcelana" },
        ". Escríbenos por WhatsApp y te asesoramos.",
      ],
    ],
    altSuffix: "lavacabezas para peluquería",
  },
};

export function getCategorySeoContent(slug: string | null | undefined): CategorySeoContent | null {
  const key = slug?.trim() ?? "";
  return Object.hasOwn(CATEGORY_SEO_CONTENT, key) ? CATEGORY_SEO_CONTENT[key] : null;
}

export function categorySeoParagraphText(paragraph: CategorySeoSegment[]): string {
  return paragraph.map((segment) => (typeof segment === "string" ? segment : segment.text)).join("");
}
