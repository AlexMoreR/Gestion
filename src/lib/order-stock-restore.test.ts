import { describe, expect, it } from "vitest";
import { stockToRestore } from "./order-stock-restore";

describe("stockToRestore", () => {
  it("solo repone lo que salió por stock y ya se confirmó, sumando por producto", () => {
    const hoy = new Date("2026-11-01T15:00:00.000Z");
    const restore = stockToRestore([
      { productId: "p1", quantity: 2, fulfillmentMode: "STOCK", confirmedAt: hoy },
      { productId: "p1", quantity: 1, fulfillmentMode: "STOCK", confirmedAt: hoy },
      { productId: "p2", quantity: 5, fulfillmentMode: "STOCK", confirmedAt: null },
      { productId: "p3", quantity: 4, fulfillmentMode: "MANUFACTURE", confirmedAt: hoy },
    ]);
    expect(Array.from(restore.entries())).toEqual([["p1", 3]]);
  });
});
