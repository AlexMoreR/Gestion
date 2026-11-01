import { describe, expect, it } from "vitest";
import { buildRetroactivosReport, type RetroactivoRow } from "./retroactivos";

const row = (over: Partial<RetroactivoRow>): RetroactivoRow => ({
  usuarioId: "u-ingrid",
  usuarioNombre: "Ingrid Gómez",
  tipo: "ABONO",
  registroId: "r1",
  fechaPuesta: new Date("2026-10-20T12:00:00Z"),
  registradoEn: new Date("2026-10-23T15:30:00Z"), // 10:30 en Colombia
  motivo: "Se me olvidó",
  monto: 300000,
  ...over,
});

describe("buildRetroactivosReport", () => {
  const rows = [
    row({}),
    row({ registroId: "r2", tipo: "VENTA", monto: 1_000_000 }),
    row({ registroId: "r3", usuarioId: "u-maria", usuarioNombre: "María Camila", tipo: "GASTO", monto: 50000, motivo: "  " }),
  ];

  it("arma cada registro con fecha real, fecha puesta, días de atraso y 'sin dato' sin inventar", () => {
    const report = buildRetroactivosReport(rows, { mes: "2026-10" });
    expect(report.total).toBe(3);
    expect(report.registros[0]).toMatchObject({
      tipo: "Abono",
      persona: "Ingrid Gómez",
      registrado_el: "2026-10-23 10:30",
      fecha_puesta: "2026-10-20",
      dias_de_atraso: 3,
      monto: 300000,
    });
    expect(report.registros[2].motivo).toBe("sin dato");
  });

  it("el resumen por persona cuenta a todos y separa por tipo, aunque se filtre la lista", () => {
    const report = buildRetroactivosReport(rows, { mes: "2026-10", persona: "ingrid" });
    expect(report.registros.map((r) => r.registro_id)).toEqual(["r1", "r2"]);
    expect(report.resumen_por_persona).toEqual([
      {
        persona: "Ingrid Gómez",
        cantidad: 2,
        por_tipo: { venta: { cantidad: 1, monto: 1_000_000 }, abono: { cantidad: 1, monto: 300000 }, gasto: { cantidad: 0, monto: 0 } },
      },
      {
        persona: "María Camila",
        cantidad: 1,
        por_tipo: { venta: { cantidad: 0, monto: 0 }, abono: { cantidad: 0, monto: 0 }, gasto: { cantidad: 1, monto: 50000 } },
      },
    ]);
  });

  it("busca la persona sin tildes y una persona sin nombre sale como 'sin dato'", () => {
    expect(buildRetroactivosReport(rows, { mes: "2026-10", persona: "MARIA" }).total).toBe(1);
    const sinNombre = buildRetroactivosReport([row({ usuarioNombre: null })], { mes: "2026-10" });
    expect(sinNombre.registros[0].persona).toBe("sin dato");
  });
});
