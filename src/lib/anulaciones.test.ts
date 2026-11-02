import { describe, expect, it, vi } from "vitest";
import { anularConMotivo, AnulacionError } from "./anulaciones";

function txFalso() {
  const pasos: string[] = [];
  const tx = {
    registroAnulado: { create: vi.fn(async () => void pasos.push("copia")) },
    salePayment: { delete: vi.fn(async () => void pasos.push("borra abono")) },
    expense: { delete: vi.fn(async () => void pasos.push("borra gasto")) },
    activityLog: { create: vi.fn(async () => void pasos.push("bitacora")) },
  };
  return { tx, pasos };
}

const base = {
  tabla: "SalePayment" as const,
  registro: { id: "pay1", amount: "50000", paymentDate: new Date("2026-10-30T00:00:00Z") },
  codigo: "SAL-00123",
  monto: 50000,
  usuarioId: "u1",
  usuarioNombre: "Alexander",
  bitacora: { entityType: "SALE" as const, entityId: "sale1", descripcion: "un abono de $50.000 de SAL-123" },
};

describe("anularConMotivo", () => {
  it("sin motivo (o con menos de 3 letras) da error y no borra", async () => {
    for (const motivo of [undefined, "", "  ab  "]) {
      const { tx, pasos } = txFalso();
      await expect(anularConMotivo(tx as never, { ...base, motivo })).rejects.toBeInstanceOf(AnulacionError);
      expect(pasos).toEqual([]);
    }
  });

  it("con motivo guarda la copia con monto, código y quién, luego borra y anota", async () => {
    const { tx, pasos } = txFalso();
    await anularConMotivo(tx as never, { ...base, motivo: "  abono repetido " });
    expect(pasos).toEqual(["copia", "borra abono", "bitacora"]);
    expect(tx.registroAnulado.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tabla: "SalePayment",
        registroId: "pay1",
        codigo: "SAL-00123",
        monto: 50000,
        motivo: "abono repetido",
        anuladoPorId: "u1",
        datos: { id: "pay1", amount: "50000", paymentDate: "2026-10-30T00:00:00.000Z" },
      }),
    });
    expect(tx.salePayment.delete).toHaveBeenCalledWith({ where: { id: "pay1" } });
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ summary: "Anuló un abono de $50.000 de SAL-123 (abono repetido)", actorId: "u1" }),
    });
  });

  it("un gasto se borra de su tabla", async () => {
    const { tx, pasos } = txFalso();
    await anularConMotivo(tx as never, { ...base, tabla: "Expense", motivo: "gasto doble" });
    expect(pasos).toEqual(["copia", "borra gasto", "bitacora"]);
  });
});
