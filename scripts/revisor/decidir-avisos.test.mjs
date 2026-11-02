// Se corre con: node --test scripts/revisor/decidir-avisos.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { decidirAvisos, textoDelAviso } from "./decidir-avisos.mjs";

const venta = { tipo: "VENTA_PAGADA_CON_SALDO", codigo: "SAL-00001", detalle: "le faltan $10.000", esPlata: true };
const stock = { tipo: "STOCK_NEGATIVO", codigo: "P1", detalle: "Silla tiene stock -2", esPlata: false };
const cuenta = { tipo: "CUENTA_NEGATIVA", codigo: "Caja", detalle: "en -$5.000", esPlata: true };

test("sin archivo de ayer todo es nuevo y solo va a Sistemas", () => {
  const { sistemas, dueno } = decidirAvisos([venta, stock], null);
  assert.deepEqual(sistemas, [venta, stock]);
  assert.deepEqual(dueno, []);
});

test("lo nuevo solo a Sistemas; lo de plata que sigue también al dueño; lo sin plata que sigue no se repite", () => {
  const { sistemas, dueno } = decidirAvisos([venta, stock, cuenta], [venta, stock]);
  assert.deepEqual(sistemas, [venta, cuenta]);
  assert.deepEqual(dueno, [venta]);
});

test("mismo tipo y código aunque cambie el detalle es el mismo hallazgo", () => {
  const { sistemas, dueno } = decidirAvisos([{ ...venta, detalle: "otro" }], [venta]);
  assert.equal(sistemas.length, 1);
  assert.equal(dueno.length, 1);
});

test("sin hallazgos no hay texto (no se manda correo)", () => {
  assert.equal(textoDelAviso([], "sistemas", "2026-11-02", null), "");
  const texto = textoDelAviso([venta, cuenta], "sistemas", "2026-11-02", [venta]);
  assert.match(texto, /Nuevos \(1\):\n- \[PLATA\] CUENTA_NEGATIVA Caja/);
  assert.match(texto, /siguen desde ayer \(1/);
  assert.match(textoDelAviso([venta], "dueno", "2026-11-02", [venta]), /siguen sin arreglar/);
});
