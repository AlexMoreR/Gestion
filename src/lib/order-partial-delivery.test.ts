import { describe, expect, it } from "vitest";
import { isOrderFullyDelivered, splitOrderItemQuantities } from "./order-partial-delivery";

describe("splitOrderItemQuantities", () => {
  it("separa 1 de 2 y 2 de 5", () => {
    expect(splitOrderItemQuantities(2, 200000, 100000, 1)).toEqual({
      keep: { quantity: 1, lineTotal: 100000 },
      moved: { quantity: 1, lineTotal: 100000 },
    });
    const r = splitOrderItemQuantities(5, 500000, 100000, 2)!;
    expect(r.keep.quantity + r.moved.quantity).toBe(5);
  });

  it("la suma de plata no cambia aunque no divida exacto", () => {
    const r = splitOrderItemQuantities(3, 100, 33.33, 1)!;
    expect(Math.round((r.keep.lineTotal + r.moved.lineTotal) * 100)).toBe(10000);
  });

  it("rechaza cantidades inválidas", () => {
    expect(splitOrderItemQuantities(2, 200, 100, 0)).toBeNull();
    expect(splitOrderItemQuantities(2, 200, 100, 2)).toBeNull();
    expect(splitOrderItemQuantities(2, 200, 100, 3)).toBeNull();
    expect(splitOrderItemQuantities(2, 200, 100, 1.5)).toBeNull();
  });
});

describe("isOrderFullyDelivered", () => {
  const d = (quantity: number, status: string) => ({ quantity, dispatch: { status } });

  it("cerrada cuando todo está entregado", () => {
    expect(isOrderFullyDelivered([{ quantity: 2, dispatchItems: [d(2, "DELIVERED")] }])).toBe(true);
  });

  it("no cerrada si algo no está despachado o el despacho no está entregado", () => {
    expect(isOrderFullyDelivered([{ quantity: 1, dispatchItems: [d(1, "DELIVERED")] }, { quantity: 1, dispatchItems: [] }])).toBe(false);
    expect(isOrderFullyDelivered([{ quantity: 1, dispatchItems: [d(1, "SHIPPED")] }])).toBe(false);
  });

  it("despachos cancelados o devueltos no cuentan", () => {
    expect(isOrderFullyDelivered([{ quantity: 1, dispatchItems: [d(1, "CANCELLED")] }])).toBe(false);
    expect(isOrderFullyDelivered([{ quantity: 1, dispatchItems: [d(1, "RETURNED")] }])).toBe(false);
  });
});
