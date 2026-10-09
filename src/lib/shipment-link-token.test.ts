import { describe, expect, it } from "vitest";
import {
  buildShipmentLinkToken,
  parseShipmentLinkToken,
  shipmentLinkSignature,
  verifyShipmentLinkSignature,
} from "./shipment-link-token";

// Enlace directo de la guia (magilus.com/guia/<codigo>.<firma>): la firma es HMAC del id con
// el secreto del servidor; no se puede fabricar ni reutilizar para otra guia y no lleva telefono.
describe("shipment link token", () => {
  const key = "secreto-de-prueba";
  const shipmentId = "ckshipment0000000000000001";
  const otherId = "ckshipment0000000000000002";
  const code = "MG-7K4Q2P8X";

  it("arma un token <codigo>.<firma> url-safe y estable", () => {
    const token = buildShipmentLinkToken(shipmentId, code, key);
    expect(token).toBe(buildShipmentLinkToken(shipmentId, code, key));
    expect(token).toMatch(/^MG-7K4Q2P8X\.[A-Za-z0-9_-]{22}$/);
  });

  it("acepta el token valido de la misma guia", () => {
    const parsed = parseShipmentLinkToken(buildShipmentLinkToken(shipmentId, code, key));
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe(code);
    expect(verifyShipmentLinkSignature(shipmentId, parsed!.signature, key)).toBe(true);
  });

  it("rechaza la firma de otra guia aunque se ponga el codigo de esta", () => {
    const foreign = shipmentLinkSignature(otherId, key)!;
    const parsed = parseShipmentLinkToken(`${code}.${foreign}`);
    expect(parsed).not.toBeNull();
    expect(verifyShipmentLinkSignature(shipmentId, parsed!.signature, key)).toBe(false);
  });

  it("rechaza firmas alteradas, de otro secreto o mal formadas", () => {
    const signature = shipmentLinkSignature(shipmentId, key)!;
    const tampered = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    expect(verifyShipmentLinkSignature(shipmentId, tampered, key)).toBe(false);
    expect(verifyShipmentLinkSignature(shipmentId, shipmentLinkSignature(shipmentId, "otro")!, key)).toBe(false);
    expect(verifyShipmentLinkSignature(shipmentId, "corta", key)).toBe(false);
    expect(parseShipmentLinkToken("")).toBeNull();
    expect(parseShipmentLinkToken("MG-7K4Q2P8X")).toBeNull();
    expect(parseShipmentLinkToken(".abc")).toBeNull();
    expect(parseShipmentLinkToken(`MG 7K4Q.${signature}`)).toBeNull();
  });

  it("sin secreto no genera ni acepta enlaces", () => {
    expect(buildShipmentLinkToken(shipmentId, code, "")).toBeNull();
    expect(verifyShipmentLinkSignature(shipmentId, shipmentLinkSignature(shipmentId, key)!, "")).toBe(false);
  });

  it("el token no lleva el id interno ni digitos de telefono", () => {
    const token = buildShipmentLinkToken(shipmentId, code, key)!;
    expect(token).not.toContain(shipmentId);
    expect(token.split(".")[0]).toBe(code);
  });
});
