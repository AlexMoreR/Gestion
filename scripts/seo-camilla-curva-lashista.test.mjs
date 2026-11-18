// Corre con `node --test scripts/seo-camilla-curva-lashista.test.mjs` (no Vitest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PARRAFO, SEO_DESCRIPTION, SEO_TITLE, SLUG, lineasDelPlan, planearSeo } from "./seo-camilla-curva-lashista.mjs";

const HOY = { id: "p1", slug: SLUG, seoTitle: null, seoDescription: "", description: "CAMILLA CURVA MEDIDA DE 1.80" };

test("con los datos de hoy sale 1 cambio y la descripción de hoy queda al final", () => {
  const { cambios, saltados } = planearSeo(HOY);
  assert.deepEqual(saltados, []);
  assert.equal(cambios.length, 1);
  assert.equal(cambios[0].id, "p1");
  assert.deepEqual(cambios[0].despues, {
    seoTitle: SEO_TITLE,
    seoDescription: SEO_DESCRIPTION,
    description: `${PARRAFO}\n\nCAMILLA CURVA MEDIDA DE 1.80`,
  });
  assert.ok(cambios[0].despues.description.endsWith("CAMILLA CURVA MEDIDA DE 1.80"));
});

test("sin descripción de hoy queda solo el párrafo", () => {
  assert.equal(planearSeo({ ...HOY, description: null }).cambios[0].despues.description, PARRAFO);
});

test("con los textos ya puestos salen 0 cambios", () => {
  const ya = planearSeo(HOY).cambios[0].despues;
  const { cambios, saltados } = planearSeo({ id: "p1", slug: SLUG, ...ya, seoTitle: ` ${ya.seoTitle} ` });
  assert.deepEqual(cambios, []);
  assert.deepEqual(saltados, [{ slug: SLUG, motivo: "ya tiene los textos nuevos" }]);
});

test("si el párrafo ya está, no se repite", () => {
  const ya = planearSeo(HOY).cambios[0].despues;
  const { cambios } = planearSeo({ ...HOY, description: ya.description });
  assert.equal(cambios[0].despues.description, ya.description);
});

test("si el producto no existe se salta", () => {
  assert.deepEqual(planearSeo(null), { cambios: [], saltados: [{ slug: SLUG, motivo: "no existe ese enlace" }] });
});

test("largos: título sin ' | Magilus' y descripción ≤ 155 con envío y garantía", () => {
  assert.equal(SEO_TITLE, "Camilla curva para lashista | Fabricante en Colombia");
  assert.ok(!SEO_TITLE.includes("Magilus"));
  assert.ok(SEO_DESCRIPTION.length <= 155, String(SEO_DESCRIPTION.length));
  assert.ok(SEO_DESCRIPTION.includes("envío a toda Colombia"));
  assert.ok(SEO_DESCRIPTION.includes("garantía de 1 año"));
});

test("párrafo: 120 a 200 palabras, las 3 frases y sin precios ni gratis", () => {
  const palabras = PARRAFO.split(/\s+/).filter(Boolean).length;
  assert.ok(palabras >= 120 && palabras <= 200, String(palabras));
  for (const frase of ["camilla curva", "camilla para lashista", "camilla para pestañas"]) {
    assert.ok(PARRAFO.toLowerCase().includes(frase), frase);
  }
  for (const texto of [PARRAFO, SEO_TITLE, SEO_DESCRIPTION]) {
    assert.ok(!texto.includes("$"), texto);
    assert.ok(!/precio|gratis/i.test(texto), texto);
  }
  // La medida de la ficha sale de la descripción: el párrafo no debe traer otra.
  assert.ok(!/medida|mide/i.test(PARRAFO));
  assert.ok(!/\d/.test(PARRAFO.replace("1 año", "")));
});

test("la simulación empieza por SIMULACION y aplicar por APLICAR", () => {
  const lineas = lineasDelPlan(planearSeo(HOY), false);
  assert.match(lineas[0], /^SIMULACION/);
  assert.equal(lineas.filter((l) => l.includes(" → ")).length, 3);
  assert.match(lineasDelPlan(planearSeo(HOY), true)[0], /^APLICAR/);
});
