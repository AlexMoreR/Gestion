import { describe, expect, it } from "vitest";
import { stableShareToken } from "./manufacturing-share-token";

// El enlace publico de la OF (magilus.com/fabricacion/<shareToken>) debe quedar
// ESTABLE para una misma (cotizacion, proveedora). Si al editar una cotizacion
// ya convertida se borra la venta y se reconvierte, el pedido (Order) se vuelve
// a crear con otro id; antes eso generaba un shareToken nuevo y el enlace que ya
// tenia la proveedora quedaba en 404. Derivar el token de (cotizacion, proveedora)
// lo mantiene igual entre recreaciones.
describe("stableShareToken", () => {
  const quoteId = "ckquote000000000000000001";
  const supplierId = "cksupplier00000000000000a";

  it("es el mismo para la misma (cotizacion, proveedora)", () => {
    const a = stableShareToken(quoteId, supplierId);
    const b = stableShareToken(quoteId, supplierId);
    expect(a).toBe(b);
  });

  it("cambia si cambia la proveedora", () => {
    const a = stableShareToken(quoteId, supplierId);
    const b = stableShareToken(quoteId, "cksupplier00000000000000b");
    expect(a).not.toBe(b);
  });

  it("cambia si cambia la cotizacion", () => {
    const a = stableShareToken(quoteId, supplierId);
    const b = stableShareToken("ckquote000000000000000002", supplierId);
    expect(a).not.toBe(b);
  });

  it("es un token url-safe de 32 caracteres", () => {
    const token = stableShareToken(quoteId, supplierId);
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
