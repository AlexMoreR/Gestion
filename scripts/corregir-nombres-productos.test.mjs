// Corre con `node --test scripts/corregir-nombres-productos.test.mjs` (no Vitest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lineasDelPlan, planearCorrecciones } from "./corregir-nombres-productos.mjs";

const SCRIPT = fileURLToPath(new URL("./corregir-nombres-productos.mjs", import.meta.url));

const HOY = [
  { id: "1", code: "ESV010", name: "EMALTERO MADERA BLANCO" },
  { id: "2", code: "CMB015", name: "COMBO CAMILLA LAHISTA" },
  { id: "3", code: "SNV004", name: "NEUT RETANGULAR" },
  { id: "4", code: "SMV001", name: "SILLA MANY Y PEDI" },
  { id: "5", code: "CMB009", name: "COMBO PREMIUM SPA 3 PIEZA" },
  { id: "6", code: "OTRO01", name: "COMBO LAHISTA OTRO" },
];

test("corrige la palabra de los 5 códigos y deja igual el resto del nombre", () => {
  const { cambios, saltados } = planearCorrecciones(HOY);
  assert.deepEqual(saltados, []);
  assert.deepEqual(
    cambios.map((c) => [c.codigo, c.nuevo]),
    [
      ["ESV010", "ESMALTERO MADERA BLANCO"],
      ["CMB015", "COMBO CAMILLA LASHISTA"],
      ["SNV004", "NEUT RECTANGULAR"],
      ["SMV001", "SILLA MANÍ Y PEDÍ"],
      ["CMB009", "COMBO PREMIUM SPA 3 PIEZAS"],
    ],
  );
});

test("respeta mayúsculas y minúsculas del nombre de hoy", () => {
  const { cambios } = planearCorrecciones([
    { id: "1", code: "CMB015", name: "Combo camilla Lahista" },
    { id: "2", code: "SNV004", name: "neut retangular" },
  ]);
  assert.deepEqual(cambios.map((c) => c.nuevo), ["Combo camilla Lashista", "neut rectangular"]);
});

test("ya corregido o sin código: se salta y no cambia nada", () => {
  const corregidos = planearCorrecciones(planearCorrecciones(HOY).cambios.map((c) => ({ id: c.id, code: c.codigo, name: c.nuevo })));
  assert.deepEqual(corregidos.cambios, []);
  assert.equal(corregidos.saltados.length, 5);
  assert.match(corregidos.saltados.find((s) => s.codigo === "CMB009").motivo, /ya no tiene/);
  const vacio = planearCorrecciones([]);
  assert.deepEqual(vacio.cambios, []);
  assert.ok(vacio.saltados.every((s) => s.motivo === "no existe ese código"));
});

test("3 PIEZAS no pasa a 3 PIEZASS y 3 PIEZA solo se cambia al final", () => {
  const { cambios } = planearCorrecciones([
    { id: "1", code: "CMB009", name: "COMBO PREMIUM SPA 3 PIEZAS" },
  ]);
  assert.deepEqual(cambios, []);
  const enMedio = planearCorrecciones([{ id: "1", code: "CMB009", name: "3 PIEZA COMBO" }]);
  assert.deepEqual(enMedio.cambios, []);
});

test("la simulación imprime SIMULACION y la línea actual → nueva de cada código", () => {
  const lineas = lineasDelPlan(planearCorrecciones(HOY), false);
  assert.match(lineas[0], /^SIMULACION/);
  assert.ok(lineas.includes('  CMB015: "COMBO CAMILLA LAHISTA" → "COMBO CAMILLA LASHISTA"'));
  assert.equal(lineas.length, 6);
});

test("con --aplicar y sin --tarjeta se niega antes de conectarse a la base", () => {
  const run = spawnSync(process.execPath, [SCRIPT, "--aplicar"], {
    env: { ...process.env, DATABASE_URL: "postgresql://nadie:nada@127.0.0.1:1/no_usar" },
    encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Falta --tarjeta T-xxx/);
  assert.doesNotMatch(run.stderr + run.stdout, /ECONNREFUSED|SIMULACION|APLICAR/);
});
