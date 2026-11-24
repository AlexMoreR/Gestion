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
  "combo-de-camillas": {
    title: "Combo de camillas para spa y pestañas | Magilus",
    description:
      "Combo de camillas para spa, masaje y pestañas: camilla con silla auxiliar, carrito y escalera. Fabricantes en Cali y Bogotá. Escríbenos por WhatsApp.",
    h1: "Combos de camillas para spa, masaje y pestañas",
    paragraphs: [
      [
        "En Magilus somos fabricantes de camillas y armamos cada combo de camillas para que montes tu cabina de spa, masaje, estética o pestañas de una sola vez. Un combo camilla junta las piezas que usas todos los días, del mismo color y acabado, y le da a tu espacio una imagen ordenada y profesional desde el primer día.",
      ],
      [
        "Tenemos varios modelos. El Combo Camilla Diván trae camilla fija, silla auxiliar giratoria, escalerilla de dos pasos y carrito auxiliar de tres niveles. El Combo Camilla Tres Cuerpos suma camilla de tres cuerpos, silla auxiliar, escalera de un paso y carrito auxiliar. El combo de camilla 3 cuerpos + silla + carrito + escalera es la camilla con silla y carrito más completa para empezar a trabajar. El Combo Camilla Premium lleva camilla de tres cuerpos, silla flor con base araña, carrito auxiliar y escalera de dos pasos. Y el Combo Camilla Lashista, pensado como camilla lashista para extensiones de pestañas, trae camilla, silla auxiliar y carrito.",
      ],
      [
        "Todos se fabrican en Cali y Bogotá. Si solo necesitas la camilla, mira nuestras ",
        { text: "camillas sueltas", href: "/camilla" },
        ". Escríbenos por WhatsApp y te asesoramos.",
      ],
    ],
    altSuffix: "combo de camilla para spa",
  },
  "mesa-manicura": {
    title: "Mesa de manicura con esmaltero y cajones | Magilus",
    description:
      "Mesa de manicura de fábrica en Cali y Bogotá, con esmaltero y cajones. Envío a toda Colombia y garantía de 1 año. Cotiza por WhatsApp.",
    h1: "Mesas de manicura",
    paragraphs: [
      [
        "En Magilus somos fabricantes de mesas de manicura para salones de uñas, spas y manicuristas independientes. Una buena mesa de manicura te deja trabajar cómoda, con los esmaltes, las limas y las herramientas a la mano, y le da a tu puesto una imagen ordenada y profesional frente a tu clienta.",
      ],
      [
        "Tenemos varios modelos de mesa manicura: con esmaltero incorporado, para tener los colores a la vista, y con cajones para guardar lo que usas en el día. Cada mesa para manicure se fabrica en nuestros talleres de Cali y Bogotá, y te ayudamos a escoger el modelo y el color que combinen con tu salón. Si buscas una mesa manicurista resistente para atender todos los días, mira la ",
        { text: "mesa de manicura MMV10", href: "/mesa-manicura/mesa-manicura-mmv10" },
        ".",
      ],
      [
        "Enviamos a toda Colombia y cada mesa tiene garantía de 1 año. Para completar tu puesto de trabajo, combínala con un ",
        { text: "esmaltero", href: "/esmalteros" },
        " y una ",
        { text: "tarima de pedicure", href: "/tarimas-pedicure" },
        " del mismo estilo. Escríbenos por WhatsApp y te asesoramos.",
      ],
    ],
    altSuffix: "mesa de manicura para salón de uñas",
  },
};

export function getCategorySeoContent(slug: string | null | undefined): CategorySeoContent | null {
  const key = slug?.trim() ?? "";
  return Object.hasOwn(CATEGORY_SEO_CONTENT, key) ? CATEGORY_SEO_CONTENT[key] : null;
}

export function categorySeoParagraphText(paragraph: CategorySeoSegment[]): string {
  return paragraph.map((segment) => (typeof segment === "string" ? segment : segment.text)).join("");
}
