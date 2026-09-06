// Documentos legales base del sitio publico. Son textos GENERICOS y editables:
// revisar y ajustar con la informacion real del negocio (correo de contacto,
// tiempos, condiciones, etc.). Se muestran en /legal/[slug].

import { siteConfig } from "@/lib/site";

export type LegalSection = {
  heading: string;
  body: string[];
};

export type LegalDoc = {
  slug: string;
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
};

export const LEGAL_UPDATED = "Septiembre de 2026";

// Enlaces del footer (orden y etiquetas visibles).
export const LEGAL_LINKS: Array<{ slug: string; label: string }> = [
  { slug: "privacidad", label: "Política de privacidad" },
  { slug: "terminos", label: "Términos y condiciones" },
  { slug: "datos", label: "Tratamiento de datos" },
  { slug: "garantia", label: "Garantía y devoluciones" },
];

export function getLegalDoc(slug: string, brandName: string): LegalDoc | null {
  const phone = siteConfig.phoneDisplay;

  const docs: Record<string, Omit<LegalDoc, "slug">> = {
    privacidad: {
      title: "Política de privacidad",
      description: `Cómo ${brandName} recopila, usa y protege tus datos personales.`,
      updated: LEGAL_UPDATED,
      sections: [
        {
          heading: "1. Quiénes somos",
          body: [
            `En ${brandName} nos tomamos en serio la privacidad de nuestros clientes. Esta política explica qué datos personales recopilamos, con qué fin y qué derechos tienes sobre ellos.`,
          ],
        },
        {
          heading: "2. Datos que recopilamos",
          body: [
            "Cuando cotizas o compras con nosotros podemos recopilar tu nombre, número de teléfono, correo electrónico, ciudad y dirección de entrega, junto con los detalles del producto o pedido que solicitas.",
          ],
        },
        {
          heading: "3. Para qué usamos tus datos",
          body: [
            "Usamos tu información únicamente para atender tus cotizaciones, coordinar la fabricación y el envío de tus productos, brindarte soporte postventa y mejorar nuestro servicio.",
          ],
        },
        {
          heading: "4. Con quién los compartimos",
          body: [
            "No vendemos tus datos. Solo los compartimos con las transportadoras y aliados estrictamente necesarios para entregar tu pedido y cumplir con nuestras obligaciones.",
          ],
        },
        {
          heading: "5. Tus derechos",
          body: [
            "Puedes conocer, actualizar, rectificar o solicitar la eliminación de tus datos en cualquier momento.",
            `Para ejercer estos derechos, escríbenos por WhatsApp o llámanos al ${phone}.`,
          ],
        },
      ],
    },
    terminos: {
      title: "Términos y condiciones",
      description: `Condiciones de uso del sitio y de compra en ${brandName}.`,
      updated: LEGAL_UPDATED,
      sections: [
        {
          heading: "1. Aceptación",
          body: [
            `Al usar este sitio y realizar cotizaciones o pedidos con ${brandName}, aceptas los presentes términos y condiciones.`,
          ],
        },
        {
          heading: "2. Productos fabricados sobre pedido",
          body: [
            "La mayoría de nuestro mobiliario se fabrica a la medida, según el requerimiento de cada cliente. Por esta razón, los tiempos de entrega se informan y confirman al momento de aprobar tu pedido.",
          ],
        },
        {
          heading: "3. Cotizaciones y precios",
          body: [
            "Los precios publicados pueden variar sin previo aviso. Cada cotización tiene una vigencia limitada que te informamos al entregarla; pasada esa fecha, los valores pueden actualizarse.",
          ],
        },
        {
          heading: "4. Pedidos, pagos y envíos",
          body: [
            "El pedido se confirma una vez acordadas las condiciones de pago. Los costos y tiempos de envío dependen de la ciudad de destino; puedes consultar la cobertura de envío gratis en nuestra página de cobertura.",
          ],
        },
        {
          heading: "5. Propiedad intelectual",
          body: [
            `La marca, el logotipo, las imágenes y el contenido de este sitio son propiedad de ${brandName} y no pueden usarse sin autorización.`,
          ],
        },
        {
          heading: "6. Cambios en estos términos",
          body: [
            "Podemos actualizar estos términos en cualquier momento. La versión vigente será siempre la publicada en este sitio.",
          ],
        },
      ],
    },
    datos: {
      title: "Política de tratamiento de datos personales",
      description: `Tratamiento de datos personales de ${brandName} conforme a la Ley 1581 de 2012.`,
      updated: LEGAL_UPDATED,
      sections: [
        {
          heading: "1. Responsable del tratamiento",
          body: [
            `${brandName} es responsable del tratamiento de los datos personales que recopila, en cumplimiento de la Ley 1581 de 2012 (Habeas Data) y sus decretos reglamentarios en Colombia.`,
          ],
        },
        {
          heading: "2. Finalidades del tratamiento",
          body: [
            "Tratamos tus datos para gestionar cotizaciones y pedidos, coordinar la fabricación y entrega, prestar soporte, enviar información comercial cuando lo autorices y cumplir obligaciones legales.",
          ],
        },
        {
          heading: "3. Derechos del titular",
          body: [
            "Como titular de los datos tienes derecho a conocer, actualizar y rectificar tu información; solicitar prueba de la autorización; ser informado sobre el uso de tus datos; revocar la autorización y solicitar la supresión cuando proceda.",
          ],
        },
        {
          heading: "4. Cómo ejercer tus derechos",
          body: [
            `Puedes ejercer estos derechos comunicándote con nosotros por WhatsApp o al teléfono ${phone}. Atenderemos tu solicitud en los términos que establece la ley.`,
          ],
        },
        {
          heading: "5. Autorización",
          body: [
            "Al entregarnos tus datos y aceptar esta política, autorizas su tratamiento conforme a las finalidades aquí descritas.",
          ],
        },
      ],
    },
    garantia: {
      title: "Garantía y devoluciones",
      description: `Condiciones de garantía y devoluciones de ${brandName}.`,
      updated: LEGAL_UPDATED,
      sections: [
        {
          heading: "1. Garantía",
          body: [
            `Nuestros productos cuentan con garantía frente a defectos de fabricación. La cobertura y el tiempo de garantía se informan según el producto adquirido.`,
          ],
        },
        {
          heading: "2. Productos hechos a la medida",
          body: [
            "Como la mayoría del mobiliario se fabrica sobre pedido según el requerimiento de cada cliente, no se aceptan devoluciones por cambio de opinión. Sí respondemos por defectos de fabricación cubiertos por la garantía.",
          ],
        },
        {
          heading: "3. Cómo solicitar la garantía",
          body: [
            `Para hacer efectiva la garantía, escríbenos por WhatsApp o llámanos al ${phone} con tu número de pedido y una descripción (o fotos) del inconveniente. Te indicaremos los pasos a seguir.`,
          ],
        },
        {
          heading: "4. Daños durante el transporte",
          body: [
            "Revisa tu pedido al momento de recibirlo. Si notas algún daño ocasionado en el transporte, repórtalo de inmediato para poder gestionarlo.",
          ],
        },
      ],
    },
  };

  const doc = docs[slug];
  if (!doc) {
    return null;
  }
  return { slug, ...doc };
}
