// Acceso por enlace firmado (/guia/<codigo>.<firma> y /guia/<codigo>.<firma>/documento).
// Puro: el parseo, la busqueda y la verificacion de la firma llegan inyectados, para poder
// probar que un token invalido nunca abre la guia. Devuelve la guia solo si el token tiene la
// forma esperada, la guia existe, la consulta publica esta activa y la firma es del id de esa guia.

export type LinkAccessDeps<T extends { id: string; publicEnabled: boolean }> = {
  parse: (token: string) => { code: string; signature: string } | null;
  normalizeCode: (raw: string) => string | null;
  findByCode: (code: string) => Promise<T | null>;
  verify: (shipmentId: string, signature: string) => boolean;
};

export async function resolveShipmentFromLinkToken<T extends { id: string; publicEnabled: boolean }>(
  token: string,
  deps: LinkAccessDeps<T>,
): Promise<T | null> {
  const parsed = deps.parse(token);
  const code = parsed ? deps.normalizeCode(parsed.code) : null;
  if (!parsed || !code) {
    return null;
  }
  const shipment = await deps.findByCode(code);
  if (!shipment || !shipment.publicEnabled || !deps.verify(shipment.id, parsed.signature)) {
    return null;
  }
  return shipment;
}
