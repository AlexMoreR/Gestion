import { describe, expect, it } from "vitest";
import { getOrderDisplayState } from "./orders";

describe("getOrderDisplayState", () => {
  it("COMPLETED con 1 producto reversado → Entregado parcial en ámbar", () => {
    const state = getOrderDisplayState("COMPLETED", { deliveryType: "SHIPPING", status: "DELIVERED" }, 1);
    expect(state.label).toBe("Entregado parcial – 1 sin entregar");
    expect(state.className).toContain("amber");
  });
  it("COMPLETED sin reversas → Cerrado – Entregado", () => {
    expect(getOrderDisplayState("COMPLETED", { deliveryType: "SHIPPING", status: "DELIVERED" }, 0).label).toBe(
      "Cerrado – Entregado",
    );
    expect(getOrderDisplayState("COMPLETED", null).label).toBe("Cerrado – Entregado");
  });
  it("DISPATCHED por envío sigue igual que antes", () => {
    expect(getOrderDisplayState("DISPATCHED", { deliveryType: "SHIPPING", status: "SHIPPED" }, 2).label).toBe(
      "Cerrado – En envío",
    );
  });
});
