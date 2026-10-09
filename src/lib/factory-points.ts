// Sedes de fabrica. Fuente unica: las usa /cobertura (mapas) y el JSON-LD de la tienda
// (LocalBusiness / FurnitureStore).
export const FACTORY_POINTS = [
  {
    title: "Sede principal - Cali",
    address: "Cra. 27 # 72X-25",
    neighborhood: "Omar Torrijos",
    city: "Cali",
    region: "Valle del Cauca",
    query: "Cra. 27 # 72X-25, Omar Torrijos, Cali, Valle del Cauca, Colombia",
  },
  {
    title: "Bogotá - Cundinamarca",
    address: "Calle 11 # 28-33 Piso 3",
    neighborhood: "El Ricaurte",
    city: "Bogotá",
    region: "Bogotá D.C.",
    query: "Calle 11 # 28-33, Ricaurte, Bogotá, Colombia",
  },
] as const;

export type FactoryPoint = (typeof FACTORY_POINTS)[number];

/** PostalAddress de schema.org para una sede. */
export function factoryPointPostalAddress(point: FactoryPoint, country = "CO") {
  return {
    "@type": "PostalAddress",
    streetAddress: `${point.address}, ${point.neighborhood}`,
    addressLocality: point.city,
    addressRegion: point.region,
    addressCountry: country,
  };
}
