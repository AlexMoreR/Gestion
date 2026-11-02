import { describe, expect, it } from "vitest";
import { saleStatusForPaid } from "./sale-paid-status";

describe("saleStatusForPaid", () => {
  it("venta nueva: pagada completa → INVOICED, si no ACTIVE", () => {
    expect(saleStatusForPaid(100, 100, "ACTIVE")).toBe("INVOICED");
    expect(saleStatusForPaid(150, 100, "ACTIVE")).toBe("INVOICED");
    expect(saleStatusForPaid(99, 100, "ACTIVE")).toBe("ACTIVE");
  });

  it("al quitar un abono y quedar debiendo vuelve a ACTIVE", () => {
    expect(saleStatusForPaid(50, 100, "INVOICED")).toBe("ACTIVE");
    expect(saleStatusForPaid(100, 100, "INVOICED")).toBe("INVOICED");
  });

  it("nunca toca CANCELLED, COMPLETED ni DRAFT", () => {
    for (const estado of ["CANCELLED", "COMPLETED", "DRAFT"] as const) {
      expect(saleStatusForPaid(0, 100, estado)).toBe(estado);
      expect(saleStatusForPaid(200, 100, estado)).toBe(estado);
    }
  });
});
