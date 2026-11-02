import { describe, expect, it } from "vitest";
import { buildActivityHistory, formatActivityLine, formatColombiaMoment, type ActivityHistoryRow } from "./activity-history";

// 30-oct-2026 9:04 a. m. en Colombia = 14:04Z.
const at = new Date("2026-10-30T14:04:00.000Z");

const edicion: ActivityHistoryRow = {
  kind: "actividad",
  at,
  persona: "Fulana",
  origin: null,
  summary: "Editó la compra COM-00010",
  before: { cantidad: 2, nota: "igual", orden: "ORD-00077" },
  after: { cantidad: 3, nota: "igual", orden: "ORD-00092" },
  ticket: null,
  commitSha: null,
};

describe("historial_de_registro", () => {
  it("escribe la hora de Colombia en 12 horas", () => {
    expect(formatColombiaMoment(at)).toBe("30-oct 9:04 a. m.");
    expect(formatColombiaMoment(new Date("2026-10-31T04:30:00.000Z"))).toBe("30-oct 11:30 p. m.");
    expect(formatColombiaMoment(new Date("2026-10-30T17:00:00.000Z"))).toBe("30-oct 12:00 p. m.");
  });

  it("una entrada sin origen sale como pantalla, con solo los campos que cambiaron", () => {
    expect(formatActivityLine(edicion)).toBe(
      "30-oct 9:04 a. m. — Fulana (pantalla) editó la compra COM-00010: antes cantidad: 2, orden: ORD-00077; después cantidad: 3, orden: ORD-00092",
    );
  });

  it("agrega origen, tarjeta y commit cuando los tiene", () => {
    const linea = formatActivityLine({
      ...edicion,
      persona: "Script reparar-ord-00092",
      origin: "SCRIPT",
      summary: "Reparó la ORD-00092",
      before: null,
      after: null,
      ticket: "T-nryjt6n9",
      commitSha: "abcdef1234567890",
    });
    expect(linea).toBe("30-oct 9:04 a. m. — Script reparar-ord-00092 (script) reparó la ORD-00092 [tarjeta T-nryjt6n9, commit abcdef1]");
  });

  it("corta el antes/después largo", () => {
    const linea = formatActivityLine({ ...edicion, before: null, after: { nota: "x".repeat(1000) } });
    expect(linea.endsWith("…")).toBe(true);
    expect(linea.length).toBeLessThan(400);
  });

  it("un cambio de estado de la orden sale en palabras", () => {
    expect(
      formatActivityLine({ kind: "estado", at, persona: "Ingrid", orderCode: "ORD-00077", fromStatus: "RELEASED", toStatus: "COMPLETED", note: null }),
    ).toBe("30-oct 9:04 a. m. — Ingrid cambió la ORD-00077 de Liberada a Completada");
  });

  it("ordena de lo más viejo a lo más nuevo y avisa si no hay nada", () => {
    const despues = { ...edicion, at: new Date("2026-10-30T15:00:00.000Z"), summary: "Segunda" };
    const reporte = buildActivityHistory([despues, edicion], "COM-00010");
    expect(reporte.lineas.map((l) => l.includes("segunda"))).toEqual([false, true]);
    expect(buildActivityHistory([], "COM-00010").aviso).toBe("La bitácora no tiene registros de COM-00010.");
  });
});
