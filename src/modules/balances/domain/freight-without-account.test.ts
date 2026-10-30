import { describe, expect, it } from "vitest";
import { matchFreightPayments } from "./freight-without-account";

describe("matchFreightPayments", () => {
  const freight = { id: "f1", saleId: "sal-79", shippingProvider: "P-06 Eliécer" };

  it("solo mismo transportador y misma venta (sin importar tildes ni mayusculas)", () => {
    const payments = [
      { id: "ok", saleId: "sal-79", supplierName: " p-06  eliecer " },
      { id: "otra-venta", saleId: "sal-80", supplierName: "P-06 Eliécer" },
      { id: "otro-proveedor", saleId: "sal-79", supplierName: "Fabrica Gladys" },
      { id: "sin-venta", saleId: null, supplierName: "P-06 Eliécer" },
    ];
    expect(matchFreightPayments(freight, payments).map((payment) => payment.id)).toEqual(["ok"]);
  });

  it("sin pagos parecidos no propone nada", () => {
    expect(matchFreightPayments(freight, [])).toEqual([]);
  });
});
