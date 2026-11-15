// Corre con `node --test scripts/seo-mesa-manicura-tarimas.test.mjs` (no Vitest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEXTOS_SEO, lineasDelPlan, planearSeo } from "./seo-mesa-manicura-tarimas.mjs";

const HOY = [
  { id: "1", slug: "mesa-manicura", seoTitle: "Mesas de manicura", seoDescription: null },
  { id: "2", slug: "tarimas-pedicure", seoTitle: "", seoDescription: "Texto escrito a mano" },
];

test("con los textos de hoy distintos salen 2 cambios y 0 saltados", () => {
  const { cambios, saltados } = planearSeo(HOY);
  assert.deepEqual(saltados, []);
  assert.deepEqual(cambios[0], {
    id: "1",
    slug: "mesa-manicura",
    antes: { seoTitle: "Mesas de manicura", seoDescription: "" },
    despues: { seoTitle: TEXTOS_SEO[0].seoTitle, seoDescription: TEXTOS_SEO[0].seoDescription },
  });
  assert.deepEqual(cambios.map((c) => c.id), ["1", "2"]);
});

test("con los textos nuevos ya puestos (con espacios) salen 0 cambios y 2 saltados", () => {
  const ya = TEXTOS_SEO.map((t, i) => ({ id: String(i + 1), slug: t.slug, seoTitle: ` ${t.seoTitle} `, seoDescription: t.seoDescription }));
  const { cambios, saltados } = planearSeo(ya);
  assert.deepEqual(cambios, []);
  assert.equal(saltados.length, 2);
  assert.ok(saltados.every((s) => s.motivo === "ya tiene los textos nuevos"));
});

test("si falta un enlace se salta y el otro sí cambia", () => {
  const { cambios, saltados } = planearSeo(HOY.filter((c) => c.slug !== "tarimas-pedicure"));
  assert.deepEqual(cambios.map((c) => c.slug), ["mesa-manicura"]);
  assert.deepEqual(saltados, [{ slug: "tarimas-pedicure", motivo: "no existe ese enlace" }]);
});

test("la tabla trae exactamente los 2 enlaces", () => {
  assert.deepEqual(TEXTOS_SEO.map((t) => t.slug), ["mesa-manicura", "tarimas-pedicure"]);
});

test("medidas de Google: título + ' | Magilus' ≤ 60 y descripción ≤ 155", () => {
  for (const t of TEXTOS_SEO) {
    assert.ok(`${t.seoTitle} | Magilus`.length <= 60, t.seoTitle);
    assert.ok(t.seoDescription.length <= 155, t.seoDescription);
  }
});

test("sin '%', sin 'descuento' y la única cifra es el 1 de '1 año'", () => {
  for (const t of TEXTOS_SEO) {
    for (const texto of [t.seoTitle, t.seoDescription]) {
      assert.ok(!texto.includes("%"), texto);
      assert.ok(!/descuento/i.test(texto), texto);
      assert.ok(!/\d/.test(texto.replace("1 año", "")), texto);
    }
  }
});

test("la simulación empieza por SIMULACION y aplicar por APLICAR", () => {
  const lineas = lineasDelPlan(planearSeo(HOY), false);
  assert.match(lineas[0], /^SIMULACION/);
  assert.equal(lineas.filter((l) => l.includes(" → ")).length, 4);
  assert.ok(lineas.includes(`  mesa-manicura: título "Mesas de manicura" → "${TEXTOS_SEO[0].seoTitle}"`));
  assert.match(lineasDelPlan(planearSeo(HOY), true)[0], /^APLICAR/);
});
