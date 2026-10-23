import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseBackupName, selectBackupsToDelete, todayInBogota } from "./retencion.mjs";

const HOY = "2026-10-22";
const RECIENTE = "gestion-2026-10-22_0230.dump";

describe("retencion de respaldos", () => {
  it("borra un respaldo de 31 dias y guarda los de 29 y exactamente 30", () => {
    const names = [
      "gestion-2026-09-21_0230.dump", // 31 dias
      "gestion-2026-09-22_0230.dump", // 30 dias
      "gestion-2026-09-23_0230.dump", // 29 dias
      RECIENTE,
    ];
    expect(selectBackupsToDelete(names, { today: HOY, keepDays: 30 })).toEqual(["gestion-2026-09-21_0230.dump"]);
  });

  it("nunca borra archivos con otro nombre aunque sean muy viejos", () => {
    const names = [
      "factura.pdf",
      "gestion-2020-01-01.dump",
      "gestion-2020-01-01_0230.dump.parcial",
      "GESTION-2020-01-01_0230.dump",
      "otra/gestion-2020-01-01_0230.dump",
      "gestion-2026-02-30_0230.dump",
      "gestion-2020-01-01_2560.dump",
      "gestion-2020-01-01_0260.dump",
      RECIENTE,
    ];
    expect(selectBackupsToDelete(names, { today: HOY, keepDays: 30 })).toEqual([]);
    expect(parseBackupName("gestion-2026-02-30_0230.dump")).toBeNull();
    expect(parseBackupName("gestion-2020-01-01_2560.dump")).toBeNull();
  });

  it("nunca borra el respaldo mas reciente aunque sea viejo", () => {
    const names = ["gestion-2026-09-07_0230.dump", "gestion-2026-08-23_0230.dump"]; // 45 y 60 dias
    expect(selectBackupsToDelete(names, { today: HOY, keepDays: 30 })).toEqual(["gestion-2026-08-23_0230.dump"]);
    expect(selectBackupsToDelete(["gestion-2020-01-01_0230.dump"], { today: HOY, keepDays: 30 })).toEqual([]);
  });

  it("toma la hora para decidir el mas reciente del mismo dia", () => {
    const names = ["gestion-2026-08-01_2300.dump", "gestion-2026-08-01_0100.dump"];
    expect(selectBackupsToDelete(names, { today: HOY, keepDays: 30 })).toEqual(["gestion-2026-08-01_0100.dump"]);
  });

  it("no repite duplicados y limpia espacios y CRLF alrededor del nombre", () => {
    const names = [
      "gestion-2026-08-01_0230.dump",
      "  gestion-2026-08-01_0230.dump  ",
      "gestion-2026-08-01_0230.dump\r",
      "\tgestion-2026-07-01_0230.dump\r\n",
      RECIENTE,
    ];
    expect(selectBackupsToDelete(names, { today: HOY, keepDays: 30 })).toEqual([
      "gestion-2026-07-01_0230.dump",
      "gestion-2026-08-01_0230.dump",
    ]);
  });

  it("calcula hoy en Colombia", () => {
    expect(todayInBogota(new Date("2026-10-23T03:00:00Z"))).toBe("2026-10-22");
    expect(todayInBogota(new Date("2026-10-23T06:00:00Z"))).toBe("2026-10-23");
  });

  it("lanza error con dias o fecha de hoy invalidos", () => {
    expect(() => selectBackupsToDelete([RECIENTE], { today: HOY, keepDays: 0 })).toThrow();
    expect(() => selectBackupsToDelete([RECIENTE], { today: HOY, keepDays: 1.5 })).toThrow();
    expect(() => selectBackupsToDelete([RECIENTE], { today: "2026-02-30", keepDays: 30 })).toThrow();
    expect(() => selectBackupsToDelete([RECIENTE], { today: "hoy", keepDays: 30 })).toThrow();
    expect(() => selectBackupsToDelete([RECIENTE], { keepDays: 30 })).toThrow();
  });

  it("cuenta bien los dias al cruzar de mes en año bisiesto", () => {
    const names = ["gestion-2028-01-30_0230.dump", "gestion-2028-01-31_0230.dump", "gestion-2028-03-01_0230.dump"];
    expect(selectBackupsToDelete(names, { today: "2028-03-01", keepDays: 30 })).toEqual(["gestion-2028-01-30_0230.dump"]);
  });

  it("funciona como programa leyendo nombres por stdin", () => {
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "retencion.mjs");
    const env = { ...process.env };
    delete env.VITEST;
    const input = [
      "factura.pdf",
      "gestion-2026-09-21_0230.dump",
      "gestion-2026-09-22_0230.dump",
      "gestion-2026-08-01_0230.dump",
      RECIENTE,
      "",
    ].join("\r\n");
    const result = spawnSync(process.execPath, [script, "--dias", "30", "--hoy", HOY], { input, env, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout.split(/\r?\n/).filter(Boolean)).toEqual([
      "gestion-2026-08-01_0230.dump",
      "gestion-2026-09-21_0230.dump",
    ]);
  });
});
