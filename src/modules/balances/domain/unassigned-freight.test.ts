import { describe, expect, it } from "vitest";
import { matchFreightPayments } from "./unassigned-freight";

describe("matchFreightPayments", () => {
  const freight = { id: "f1", saleId: "sal-79", shippingProvider: "P-06 Eliecer" };

  it("encuentra el pago del mismo transportador en la misma venta", () => {
    const pago = { id: "p1", saleId: "sal-79", supplierName: "p-06 eliécer ", supplierDisplayName: null };
    expect(matchFreightPayments([freight], [pago]).get("f1")).toEqual([pago]);
  });

  it("tambien por el nombre visible del proveedor", () => {
    const pago = { id: "p1", saleId: "sal-79", supplierName: "Eliecer Ruiz", supplierDisplayName: "P-06 Eliecer" };
    expect(matchFreightPayments([freight], [pago]).get("f1")).toHaveLength(1);
  });

  it("otra venta u otro transportador no es candidato", () => {
    const otraVenta = { id: "p1", saleId: "sal-80", supplierName: "P-06 Eliecer", supplierDisplayName: null };
    const otroTransportador = { id: "p2", saleId: "sal-79", supplierName: "P-04 Don Rafa", supplierDisplayName: null };
    expect(matchFreightPayments([freight], [otraVenta, otroTransportador]).get("f1")).toEqual([]);
  });

  it("flete sin nombre de transportador no encaja con nada", () => {
    const pago = { id: "p1", saleId: "sal-79", supplierName: "", supplierDisplayName: null };
    expect(matchFreightPayments([{ ...freight, shippingProvider: " " }], [pago]).get("f1")).toEqual([]);
  });
});
