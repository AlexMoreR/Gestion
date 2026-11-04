import { describe, expect, it } from "vitest";
import { SALES_LINE_WHATSAPP } from "./site";

describe("SALES_LINE_WHATSAPP", () => {
  it("mantiene los números de Ventas 1 y Ventas 2", () => {
    expect(SALES_LINE_WHATSAPP).toEqual({ "1": "573169831667", "2": "573205138377" });
  });
});
