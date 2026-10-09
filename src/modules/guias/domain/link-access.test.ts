import { describe, expect, it, vi } from "vitest";
import {
  buildShipmentLinkToken,
  parseShipmentLinkToken,
  verifyShipmentLinkSignature,
} from "../../../lib/shipment-link-token";
import { normalizeShipmentCodeInput } from "./codes";
import { resolveShipmentFromLinkToken } from "./link-access";

// Lo usan /guia/[token] (estado del envio) y /guia/[token]/documento (documento formal):
// un token invalido nunca abre la guia.
describe("resolveShipmentFromLinkToken (enlace directo y documento de la guia)", () => {
  const key = "secreto-de-prueba-suficientemente-largo";
  const shipment = { id: "ckshipment0000000000000001", code: "MG-7K4Q2P8X", publicEnabled: true };

  const deps = (row: typeof shipment | null = shipment) => {
    const findByCode = vi.fn(async (code: string) => (row && code === row.code ? row : null));
    return {
      findByCode,
      deps: {
        parse: parseShipmentLinkToken,
        normalizeCode: normalizeShipmentCodeInput,
        findByCode,
        verify: (id: string, signature: string) => verifyShipmentLinkSignature(id, signature, key),
      },
    };
  };

  it("abre la guia con el token firmado correcto", async () => {
    const token = buildShipmentLinkToken(shipment.id, shipment.code, key)!;
    const { deps: d } = deps();
    await expect(resolveShipmentFromLinkToken(token, d)).resolves.toEqual(shipment);
  });

  it("rechaza tokens mal formados sin consultar la BD", async () => {
    const { deps: d, findByCode } = deps();
    for (const bad of ["", "MG-7K4Q2P8X", "MG-7K4Q2P8X.", ".abc", "MG 7K4Q2P8X.xxxxxxxxxxxxxxxxxxxxxx", "a".repeat(200)]) {
      await expect(resolveShipmentFromLinkToken(bad, d)).resolves.toBeNull();
    }
    expect(findByCode).not.toHaveBeenCalled();
  });

  it("rechaza una firma falsa o de otra guia", async () => {
    const { deps: d } = deps();
    const forged = `${shipment.code}.${"A".repeat(22)}`;
    const otherGuide = buildShipmentLinkToken("ckshipment0000000000000999", shipment.code, key)!;
    const otherKey = buildShipmentLinkToken(shipment.id, shipment.code, "otra-llave-cualquiera-larga")!;
    await expect(resolveShipmentFromLinkToken(forged, d)).resolves.toBeNull();
    await expect(resolveShipmentFromLinkToken(otherGuide, d)).resolves.toBeNull();
    await expect(resolveShipmentFromLinkToken(otherKey, d)).resolves.toBeNull();
  });

  it("rechaza la guia con la consulta publica apagada o inexistente", async () => {
    const token = buildShipmentLinkToken(shipment.id, shipment.code, key)!;
    await expect(resolveShipmentFromLinkToken(token, deps({ ...shipment, publicEnabled: false }).deps)).resolves.toBeNull();
    await expect(resolveShipmentFromLinkToken(token, deps(null).deps)).resolves.toBeNull();
  });
});
