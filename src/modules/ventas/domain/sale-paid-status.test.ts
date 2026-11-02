import { describe, expect, it } from "vitest";
import { saleStatusForPaid } from "./sale-paid-status";

describe("saleStatusForPaid", () => {
  it("pagado ≥ total → INVOICED", () => {
    expect(saleStatusForPaid(100, 100, "ACTIVE")).toBe("INVOICED");
    expect(saleStatusForPaid(120, 100, "INVOICED")).toBe("INVOICED");
  });
  it("si baja del total → ACTIVE", () => {
    expect(saleStatusForPaid(99, 100, "INVOICED")).toBe("ACTIVE");
    expect(saleStatusForPaid(0, 100, "ACTIVE")).toBe("ACTIVE");
  });
  it("nunca toca CANCELLED, COMPLETED ni DRAFT", () => {
    expect(saleStatusForPaid(0, 100, "CANCELLED")).toBe("CANCELLED");
    expect(saleStatusForPaid(100, 100, "CANCELLED")).toBe("CANCELLED");
    expect(saleStatusForPaid(0, 100, "COMPLETED")).toBe("COMPLETED");
    expect(saleStatusForPaid(100, 100, "DRAFT")).toBe("DRAFT");
  });
});
