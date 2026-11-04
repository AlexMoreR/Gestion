import { describe, expect, it } from "vitest";
import { buildCoverageReport, type CoveragePlaceRow, type CoverageDepartmentRow } from "./coverage-report";

const lugar = (nombre: string, extra: Partial<CoveragePlaceRow> = {}): CoveragePlaceRow => ({
  nombre,
  shippingType: null,
  freeShipping: false,
  needsReview: false,
  ...extra,
});

const filas: CoverageDepartmentRow[] = [
  {
    nombre: "Valle del Cauca",
    municipios: [
      {
        ...lugar("Santiago de Cali", { shippingType: "GRATIS" }),
        corregimientos: [lugar("Pance"), lugar("La Buitrera", { shippingType: "ADICIONAL", needsReview: true })],
      },
      { ...lugar("Buga", { freeShipping: true }), corregimientos: [] },
      { ...lugar("Dagua"), corregimientos: [lugar("Borrero Ayerbe", { shippingType: "GRATIS" })] },
    ],
  },
  {
    nombre: "Nariño",
    municipios: [{ ...lugar("Tumaco", { shippingType: "NO_LLEGA", needsReview: true }), corregimientos: [] }],
  },
];

describe("buildCoverageReport", () => {
  const report = buildCoverageReport(filas);
  const valle = report.departamentos.find((d) => d.departamento === "Valle del Cauca")!;
  const cali = valle.municipios.find((m) => m.municipio === "Santiago de Cali")!;

  it("el corregimiento que hereda el tipo de su municipio no se lista pero cuenta", () => {
    expect(cali.corregimientos_distintos.map((c) => c.nombre)).not.toContain("Pance");
    expect(report.totales.corregimientos.GRATIS).toBe(2); // Pance (heredado) + Borrero Ayerbe
  });

  it("el corregimiento con tipo distinto se lista", () => {
    expect(cali.corregimientos_distintos).toEqual([
      { nombre: "La Buitrera", tipo: "ADICIONAL", pendiente_revision: true },
    ]);
  });

  it("freeShipping true sin tipo es GRATIS", () => {
    expect(valle.municipios.find((m) => m.municipio === "Buga")!.tipo).toBe("GRATIS");
  });

  it("un lugar sin nada es COTIZAR", () => {
    expect(valle.municipios.find((m) => m.municipio === "Dagua")!.tipo).toBe("COTIZAR");
  });

  it("filtra por tipo y deja el municipio como contenedor con su tipo real", () => {
    const gratis = buildCoverageReport(filas, { tipo: "gratis" });
    expect(gratis.departamentos.map((d) => d.departamento)).toEqual(["Valle del Cauca"]);
    const municipios = gratis.departamentos[0].municipios;
    expect(municipios.map((m) => m.municipio)).toEqual(["Santiago de Cali", "Buga", "Dagua"]);
    expect(municipios[0].corregimientos_distintos).toEqual([]);
    expect(municipios[2]).toMatchObject({ tipo: "COTIZAR", corregimientos_distintos: [{ nombre: "Borrero Ayerbe", tipo: "GRATIS" }] });
    // Los totales no dependen del filtro de tipo.
    expect(gratis.totales).toEqual(report.totales);
  });

  it("el filtro 'narino' encuentra Nariño y los totales quedan dentro del departamento", () => {
    const narino = buildCoverageReport(filas, { departamento: "narino" });
    expect(narino.departamentos.map((d) => d.departamento)).toEqual(["Nariño"]);
    expect(narino.totales.municipios).toEqual({ GRATIS: 0, ADICIONAL: 0, COTIZAR: 0, NO_LLEGA: 1 });
    expect(narino.totales.corregimientos).toEqual({ GRATIS: 0, ADICIONAL: 0, COTIZAR: 0, NO_LLEGA: 0 });
  });

  it("cuenta los totales por tipo", () => {
    expect(report.totales.municipios).toEqual({ GRATIS: 2, ADICIONAL: 0, COTIZAR: 1, NO_LLEGA: 1 });
    expect(report.totales.corregimientos).toEqual({ GRATIS: 2, ADICIONAL: 1, COTIZAR: 0, NO_LLEGA: 0 });
  });

  it("marca pendiente_revision", () => {
    const tumaco = report.departamentos.find((d) => d.departamento === "Nariño")!.municipios[0];
    expect(tumaco.pendiente_revision).toBe(true);
    expect(cali.pendiente_revision).toBe(false);
  });
});
