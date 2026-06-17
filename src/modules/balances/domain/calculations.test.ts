import { describe, expect, it } from "vitest";
import {
  calculateSaleProfitSummary,
  summarizeDashboardMetrics,
  summarizeSupplierBalance,
} from "./calculations";

describe("balances calculations", () => {
  it("calculates sale profit with supplier and shipping costs", () => {
    const result = calculateSaleProfitSummary({
      saleId: "sale-1",
      saleCode: "SAL-001",
      saleAmount: 1000,
      createdAt: new Date("2026-06-17T00:00:00.000Z"),
      clientName: "Cliente Demo",
      orderItems: [
        { quantity: 2, purchaseCost: 100 },
        { quantity: 1, purchaseCost: 50 },
      ],
      shippingCosts: [25, 25],
    });

    expect(result.supplierCosts).toBe(250);
    expect(result.shippingCosts).toBe(50);
    expect(result.netProfit).toBe(700);
    expect(result.marginPercentage).toBe(70);
  });

  it("summarizes supplier balances", () => {
    const result = summarizeSupplierBalance("supplier-1", "Proveedor Demo", [
      { amount: 120, createdAt: new Date("2026-06-17T12:00:00.000Z"), saleCode: "SAL-002" },
      { amount: 80, createdAt: new Date("2026-06-16T12:00:00.000Z"), saleCode: "SAL-001" },
    ]);

    expect(result.paymentCount).toBe(2);
    expect(result.totalPaid).toBe(200);
    expect(result.lastSaleCode).toBe("SAL-002");
  });

  it("summarizes dashboard metrics", () => {
    const result = summarizeDashboardMetrics([
      {
        saleId: "1",
        saleCode: "SAL-001",
        saleAmount: 1000,
        supplierCosts: 200,
        shippingCosts: 50,
        netProfit: 750,
        marginPercentage: 75,
        createdAt: new Date("2026-06-17T00:00:00.000Z"),
        clientName: null,
      },
      {
        saleId: "2",
        saleCode: "SAL-002",
        saleAmount: 500,
        supplierCosts: 100,
        shippingCosts: 25,
        netProfit: 375,
        marginPercentage: 75,
        createdAt: new Date("2026-06-17T00:00:00.000Z"),
        clientName: null,
      },
    ]);

    expect(result.salesCount).toBe(2);
    expect(result.salesTotal).toBe(1500);
    expect(result.netProfit).toBe(1125);
    expect(result.bestSale?.saleCode).toBe("SAL-001");
  });
});
