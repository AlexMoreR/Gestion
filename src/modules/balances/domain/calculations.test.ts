import { describe, expect, it } from "vitest";
import {
  calculateSaleProfitSummary,
  pickSaleCostItems,
  productsWithoutCost,
  saleCostIssues,
  summarizeAccountBalance,
  summarizeDashboardMetrics,
  summarizeSupplierBalance,
} from "./calculations";
import type { Account } from "./entities";

describe("balances calculations", () => {
  it("calculates sale profit with supplier and shipping costs", () => {
    const result = calculateSaleProfitSummary({
      saleId: "sale-1",
      saleCode: "SAL-001",
      saleAmount: 1000,
      createdAt: new Date("2026-06-17T00:00:00.000Z"),
      clientName: "Cliente Demo",
      orderItems: [
        { quantity: 2, purchaseCost: 100, fulfillmentMode: "MANUFACTURE", baseCost: 0, additionalCost: 0 },
        { quantity: 1, purchaseCost: 50, fulfillmentMode: "MANUFACTURE", baseCost: 0, additionalCost: 0 },
      ],
      shippingCosts: [25, 25],
    });

    expect(result.supplierCosts).toBe(250);
    expect(result.shippingCosts).toBe(50);
    expect(result.netProfit).toBe(700);
    expect(result.marginPercentage).toBe(70);
  });

  it("usa el costo de inventario (base + envio) para items de stock", () => {
    const result = calculateSaleProfitSummary({
      saleId: "sale-2",
      saleCode: "SAL-002",
      saleAmount: 1000,
      createdAt: new Date("2026-06-17T00:00:00.000Z"),
      clientName: null,
      // Stock sin purchaseCost: costo = baseCost + additionalCost (flete).
      orderItems: [{ quantity: 1, purchaseCost: null, fulfillmentMode: "STOCK", baseCost: 600, additionalCost: 100 }],
      shippingCosts: [],
    });

    expect(result.supplierCosts).toBe(700);
    expect(result.netProfit).toBe(300);
  });

  it("venta de stock sin orden: el costo sale de la cotizacion con el catalogo (caso SAL-00083)", () => {
    const quoteItems = [{ quantity: 1, purchaseCost: null, fulfillmentMode: "STOCK", baseCost: 450000, additionalCost: 30000 }];
    const result = calculateSaleProfitSummary({
      saleId: "sale-3",
      saleCode: "SAL-00083",
      saleAmount: 749000,
      createdAt: new Date("2026-10-20T12:00:00.000Z"),
      clientName: null,
      orderItems: pickSaleCostItems(undefined, quoteItems),
      shippingCosts: [],
    });

    expect(result.supplierCosts).toBe(480000);
    expect(result.netProfit).toBe(269000);
  });

  it("con orden se siguen usando los items de la orden (costo confirmado)", () => {
    const orderItems = [{ quantity: 1, purchaseCost: 500, fulfillmentMode: "MANUFACTURE", baseCost: 300, additionalCost: 0 }];
    const quoteItems = [{ quantity: 1, purchaseCost: null, fulfillmentMode: "MANUFACTURE", baseCost: 300, additionalCost: 0 }];
    expect(pickSaleCostItems(orderItems, quoteItems)).toBe(orderItems);
    // Orden vacia: cae a la cotizacion.
    expect(pickSaleCostItems([], quoteItems)).toBe(quoteItems);
  });

  it("detecta productos sin costo en el catalogo", () => {
    const result = productsWithoutCost([
      { name: "Silla", baseCost: 0, additionalCost: 0 },
      { name: "Camilla", baseCost: 100, additionalCost: 0 },
      { name: "Butaco", baseCost: 0, additionalCost: 20 },
    ]);
    expect(result.map((product) => product.name)).toEqual(["Silla"]);
  });

  it("explica por que una venta tiene costo dudoso", () => {
    const item = { quantity: 1, purchaseCost: null, fulfillmentMode: "STOCK", baseCost: 100, additionalCost: 0 };
    expect(saleCostIssues({ orderItems: null, quoteItems: [], productsWithoutCostNames: [] })).toEqual([
      "sin productos (ni en la orden ni en la cotizacion)",
    ]);
    expect(saleCostIssues({ orderItems: [], quoteItems: [item], productsWithoutCostNames: ["Silla"] })).toEqual([
      "sin orden: antes costo 0, ahora usa el costo del catalogo",
      "producto sin costo en el catalogo: Silla",
    ]);
    expect(saleCostIssues({ orderItems: [item], quoteItems: [item], productsWithoutCostNames: [] })).toEqual([]);
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

  it("summarizes account balance: ingreso - gasto + movimientos (sin saldo inicial)", () => {
    const account: Account = {
      id: "acc-1",
      name: "Nequi1",
      type: "WALLET",
      reference: "3001234567",
      isActive: true,
      openingBalance: 100,
      createdAt: new Date("2026-06-17T00:00:00.000Z"),
    };

    const result = summarizeAccountBalance(account, {
      ingreso: 500,
      gasto: 200,
      movimientosIn: 50,
      movimientosOut: 30,
    });

    expect(result.ingreso).toBe(500);
    expect(result.gasto).toBe(200);
    expect(result.movimientos).toBe(20);
    expect(result.periodOpening).toBe(100);
    expect(result.balance).toBe(320);
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
        pendingDelivery: false,
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
        pendingDelivery: false,
      },
    ]);

    expect(result.salesCount).toBe(2);
    expect(result.salesTotal).toBe(1500);
    expect(result.netProfit).toBe(1125);
    expect(result.bestSale?.saleCode).toBe("SAL-001");
  });
});
