import { describe, expect, it } from "vitest";
import { describeApplicationUseCase, type AppCodeFacts } from "./describe-application";
import type { AppSnapshot } from "../domain/app-overview";
import type { AppIntrospectionSource } from "../domain/repository";

const MANUAL = "# Manual de pantallas\n\n## Tareas del día a día\n\n## /admin/ventas\n";

// Fuente falsa: sin base ni disco; solo el manual (en vivo o en la foto) cambia entre casos.
function source(opts: { live?: string | null; snapshot?: string | null }): AppIntrospectionSource {
  return {
    readPrismaSchema: async () => null,
    listMigrations: async () => [],
    readPackageManifest: async () => null,
    readInstalledVersions: async () => ({}),
    readBuildSnapshot: async () =>
      opts.snapshot === undefined
        ? null
        : ({ manualPantallas: opts.snapshot ? { archivo: "docs/asesor/pantallas.md", contenido: opts.snapshot } : null } as AppSnapshot),
    readOverviewDocument: async () => null,
    readScreensManual: async () => opts.live ?? null,
    countRecords: async () => ({}),
  };
}

const facts: AppCodeFacts = {
  nodeVersion: "v20",
  adminModules: [],
  quoteStatusLabels: {},
  commissionRates: { primeraVentaDelMes: 0.15, desdeLaSegunda: 0.15 },
};

describe("que_es_esta_aplicacion: seccion pantallas", () => {
  it("'pantallas' devuelve el manual (en vivo o, si no, de la foto del build)", async () => {
    const live = await describeApplicationUseCase(source({ live: MANUAL }), facts, "pantallas");
    expect(live.pantallas).toEqual({ archivo: "docs/asesor/pantallas.md", leido_de: "repositorio (en vivo)", contenido: MANUAL });
    const fromSnapshot = await describeApplicationUseCase(source({ snapshot: MANUAL }), facts, "pantallas");
    expect(fromSnapshot.pantallas).toMatchObject({ leido_de: "foto del build", contenido: MANUAL });
  });

  it("sin manual dice 'no disponible'", async () => {
    const result = await describeApplicationUseCase(source({}), facts, "pantallas");
    expect(result.pantallas).toEqual({ archivo: "docs/asesor/pantallas.md", leido_de: "no disponible", contenido: null });
  });

  it("'todo' no trae el manual completo, solo la indicación de pedir seccion='pantallas'", async () => {
    const result = await describeApplicationUseCase(source({ live: MANUAL }), facts, "todo");
    expect(typeof result.pantallas).toBe("string");
    expect(String(result.pantallas)).toContain("seccion='pantallas'");
    expect(JSON.stringify(result)).not.toContain("Tareas del día a día");
  });
});
