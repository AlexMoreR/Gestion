import { describe, expect, it } from "vitest";
import { DELIVERY_CONFIRMED_FIELD, isDeliveryConfirmed } from "./delivery-confirmation";

describe("isDeliveryConfirmed", () => {
  it("solo acepta la casilla marcada", () => {
    const marked = new FormData();
    marked.set(DELIVERY_CONFIRMED_FIELD, "on");
    expect(isDeliveryConfirmed(marked)).toBe(true);

    expect(isDeliveryConfirmed(new FormData())).toBe(false);

    const other = new FormData();
    other.set(DELIVERY_CONFIRMED_FIELD, "true");
    expect(isDeliveryConfirmed(other)).toBe(false);
  });
});
