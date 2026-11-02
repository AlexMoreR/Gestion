import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { anularConMotivo } from "./anulaciones";

function txFalso() {
  const pasos: string[] = [];
  const tx = {
    registroAnulado: { create: vi.fn(async () => pasos.push("copia")) },
    salePayment: { delete: vi.fn(async () => pasos.push("borra")) },
    expense: { delete: vi.fn(async () => pasos.push("borra")) },
    activityLog: { create: vi.fn(async () => pasos.push("bitacora")) },
  };
  return { tx, pasos, cliente: tx as unknown as Prisma.TransactionClient };
}

const abono = { id: "p1", amount: "150000", paymentDate: new Date("2026-10-30T00:00:00Z") };

describe("anularConMotivo", () => {
  it("sin motivo da error y no borra", async () => {
    const { tx, pasos, cliente } = txFalso();
    for (const motivo of ["", "  ", " ab "]) {
      await expect(
        anularConMotivo(cliente, { tabla: "SalePayment", registro: abono, codigo: "SAL-00010", monto: 150000, motivo, usuarioId: "u1" }),
      ).rejects.toThrow(/motivo/);
    }
    expect(pasos).toEqual([]);
    expect(tx.salePayment.delete).not.toHaveBeenCalled();
  });

  it("con motivo guarda la copia (monto, código, quién) y luego borra", async () => {
    const { tx, pasos, cliente } = txFalso();
    await anularConMotivo(cliente, {
      tabla: "SalePayment",
      registro: abono,
      codigo: "SAL-00010",
      monto: 150000,
      motivo: "  abono duplicado ",
      usuarioId: "u1",
      usuarioNombre: "Alexander",
    });
    expect(pasos).toEqual(["copia", "borra", "bitacora"]);
    expect(tx.registroAnulado.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tabla: "SalePayment",
        registroId: "p1",
        codigo: "SAL-00010",
        monto: 150000,
        motivo: "abono duplicado",
        anuladoPorId: "u1",
        datos: { id: "p1", amount: "150000", paymentDate: "2026-10-30T00:00:00.000Z" },
      }),
    });
    expect(tx.salePayment.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    const log = (tx.activityLog.create.mock.calls[0] as unknown as [{ data: { summary: string } }])[0];
    expect(log.data.summary).toContain("Anuló un abono");
    expect(log.data.summary).toContain("(abono duplicado)");
  });

  it("un gasto se borra de la tabla Expense", async () => {
    const { tx, cliente } = txFalso();
    await anularConMotivo(cliente, { tabla: "Expense", registro: { id: "g1" }, monto: 5000, motivo: "repetido", usuarioId: "u1" });
    expect(tx.expense.delete).toHaveBeenCalledWith({ where: { id: "g1" } });
    expect(tx.salePayment.delete).not.toHaveBeenCalled();
  });
});
