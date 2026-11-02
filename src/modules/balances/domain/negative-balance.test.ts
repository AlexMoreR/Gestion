import { describe, expect, it } from "vitest";
import { negativeBalanceNotice } from "./negative-balance";

describe("negativeBalanceNotice", () => {
  it("avisa cuando la cuenta queda en negativo", () => {
    const notice = negativeBalanceNotice("3-Caja", -5136330);
    expect(notice).toContain("3-Caja");
    expect(notice).toContain("quedó en");
    expect(notice).toContain("5.136.330");
  });

  it("no avisa con saldo 0 ni positivo", () => {
    expect(negativeBalanceNotice("3-Caja", 0)).toBe("");
    expect(negativeBalanceNotice("3-Caja", 1000)).toBe("");
  });
});
