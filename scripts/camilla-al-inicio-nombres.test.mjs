// Corre con `node --test scripts/camilla-al-inicio-nombres.test.mjs` (no Vitest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { RENOMBRES, lineasDelPlan, planearCamilla } from "./camilla-al-inicio-nombres.mjs";

const HOY = RENOMBRES.map((r, i) => ({ id: String(i + 1), code: r.codigo, name: r.antes }));

test("(a) con los 6 nombres de hoy salen los 6 nombres nuevos y ningún saltado", () => {
  const { cambios, saltados } = planearCamilla(HOY);
  assert.deepEqual(saltados, []);
  assert.deepEqual(
    cambios.map((c) => [c.codigo, c.nuevo]),
    [
      ["CAV004", "CAMILLA 2 CUERPOS OVAL"],
      ["CAV005", "CAMILLA 3 CUERPOS BRAZOS CORTOS"],
      ["CAV015", "CAMILLA 3 CUERPOS CON BRAZOS"],
      ["CAV007", "CAMILLA 3 CUERPOS TATTOO"],
      ["CAV009", "CAMILLA EN MADERA CABECERO"],
      ["CAV006", "CAMILLA 3 CUERPOS CON CAJONES"],
    ],
  );
});

test("quita los espacios de los extremos antes de comparar", () => {
  const { cambios } = planearCamilla([{ id: "1", code: "CAV004", name: "  2 CUERPOS OVAL " }]);
  assert.deepEqual(cambios, [{ id: "1", codigo: "CAV004", actual: "2 CUERPOS OVAL", nuevo: "CAMILLA 2 CUERPOS OVAL" }]);
});

test("(b) con los nombres ya cambiados salen 0 cambios y 6 saltados", () => {
  const ya = RENOMBRES.map((r, i) => ({ id: String(i + 1), code: r.codigo, name: r.nuevo }));
  const { cambios, saltados } = planearCamilla(ya);
  assert.deepEqual(cambios, []);
  assert.equal(saltados.length, 6);
  assert.ok(saltados.every((s) => s.motivo === "ya tiene el nombre nuevo"));
});

test("(c) un producto con otro nombre se salta con el nombre que tiene hoy", () => {
  const { cambios, saltados } = planearCamilla([{ id: "1", code: "CAV007", name: "3 CUERPOS TATTOO" }]);
  assert.deepEqual(cambios, []);
  assert.deepEqual(saltados.find((s) => s.codigo === "CAV007"), {
    codigo: "CAV007",
    motivo: 'tiene otro nombre ("3 CUERPOS TATTOO")',
  });
});

test("(d) un código que falta se salta", () => {
  const { cambios, saltados } = planearCamilla(HOY.filter((p) => p.code !== "CAV009"));
  assert.equal(cambios.length, 5);
  assert.deepEqual(saltados, [{ codigo: "CAV009", motivo: "no existe ese código" }]);
});

test("(e) la simulación empieza por SIMULACION y trae 6 líneas con →", () => {
  const lineas = lineasDelPlan(planearCamilla(HOY), false);
  assert.match(lineas[0], /^SIMULACION/);
  assert.equal(lineas.filter((l) => l.includes(" → ")).length, 6);
  assert.ok(lineas.includes('  CAV006: "TRES CUERPOS CON CAJONES" → "CAMILLA 3 CUERPOS CON CAJONES"'));
  assert.match(lineasDelPlan(planearCamilla(HOY), true)[0], /^APLICAR/);
});
