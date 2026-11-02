import { describe, expect, it } from "vitest";
import type { BalancesRepository } from "../domain/repository";
import type { AccountBalance } from "../domain/entities";
import { accountNegativeBalanceNotice, withNegativeBalanceNotice } from "./use-cases";

function repoWith(balance: number | Error): BalancesRepository {
  return {
    async getAccountBalance(id: string): Promise<AccountBalance | null> {
      if (balance instanceof Error) throw balance;
      return {
        id,
        name: "3-Caja",
        type: "CASH",
        reference: null,
        isActive: true,
        openingBalance: 0,
        createdAt: new Date(0),
        periodOpening: 0,
        ingreso: 0,
        gasto: 0,
        movimientos: 0,
        balance,
      };
    },
  } as unknown as BalancesRepository;
}

describe("aviso de cuenta en negativo después de guardar", () => {
  it("avisa con el saldo que quedó", async () => {
    expect(await accountNegativeBalanceNotice(repoWith(-5136330), "c1")).toContain("5.136.330");
    expect(await withNegativeBalanceNotice(repoWith(-1000), "Abono registrado", "c1")).toMatch(/^Abono registrado\. Ojo: 3-Caja/);
  });

  it("no avisa con saldo positivo, sin cuenta ni si falla la consulta", async () => {
    expect(await accountNegativeBalanceNotice(repoWith(500), "c1")).toBe("");
    expect(await accountNegativeBalanceNotice(repoWith(-500), null)).toBe("");
    expect(await withNegativeBalanceNotice(repoWith(new Error("caída")), "Abono registrado", "c1")).toBe("Abono registrado");
  });
});
