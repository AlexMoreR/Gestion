// Corre con `node --test scripts/corregir-combos-lote-ord-116.test.mjs` (no Vitest).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { COMPRA, lineasDeOrden, leerUnidadesForzadas, mismoColor, planearOrden } from "./corregir-combos-lote-ord-116.mjs";

const SCRIPT = fileURLToPath(new URL("./corregir-combos-lote-ord-116.mjs", import.meta.url));

// Combo: carrito, escalera, divan y butaco (principal CORAZON, alterna CUADRADO).
const combo = {
  id: "cmb",
  code: "CMB005",
  name: "Combo camilla",
  components: [
    { childId: "carrito", quantity: 1, alternates: [] },
    { childId: "escalera", quantity: 1, alternates: [] },
    { childId: "divan", quantity: 1, alternates: [] },
    { childId: "corazon", quantity: 1, alternates: ["cuadrado"] },
  ],
};
const linea = (productId, purchaseCost) => ({ productId, quantity: 6, purchaseCost, notes: "Combo Combo camilla" });
const compra = {
  code: COMPRA,
  purchaseCode: "COM-00050",
  items: [linea("carrito", 90000), linea("escalera", 40000), linea("divan", 230000), linea("corazon", 220000)],
};
const meta = (extra = {}) => JSON.stringify({ _type: "quote-item-meta", comboCode: "CMB005", color: "Negro", ...extra });
const item = (id, productId, purchaseCost, stockCostSource, extra = {}) => ({
  id,
  quoteItemId: `q-${id}`,
  productId,
  quantity: 1,
  fulfillmentMode: "STOCK",
  confirmedAt: new Date("2026-11-24T15:00:00Z"),
  purchaseCost,
  stockCostSource,
  notes: meta(),
  despachos: [],
  ...extra,
});
const orden = (cambios = {}) => ({
  id: "o119",
  code: "ORD-00119",
  status: "READY_FOR_DISPATCH",
  devolucionesAbiertas: 0,
  items: [
    item("i1", "carrito", 100000, "ORD-00099"),
    item("i2", "escalera", 45000, "ORD-00099"),
    item("i3", "divan", 235000, "ORD-00099"),
    item("i4", "cuadrado", 220000, "ORD-00092"),
  ],
  ...cambios,
});
const unidades = () => [
  { id: "u1", estado: "FABRICANDO", color: "negro", saleOrderId: null },
  { id: "u2", estado: "FABRICANDO", color: "palo de rosa", saleOrderId: null },
  ...["u3", "u4", "u5", "u6"].map((id) => ({ id, estado: "PENDIENTE", color: null, saleOrderId: null })),
];
const salidas = new Map([["carrito", 1], ["escalera", 1], ["divan", 1], ["cuadrado", 1]]);
const base = () => ({ orden: orden(), compra, combo, unidades: unidades(), salidas });

test("costo de 600.000 pasa a 580.000 con la unidad negra del lote", () => {
  const plan = planearOrden(base());
  assert.equal(plan.estado, "listo");
  assert.equal(plan.costoTotalAntes, 600000);
  assert.equal(plan.costoTotalDespues, 580000);
  assert.equal(plan.unidad.id, "u1");
  assert.equal(plan.unidad.necesitaLlegada, true);
  assert.deepEqual(plan.piezas.map((p) => p.origenAntes), ["ORD-00099", "ORD-00099", "ORD-00099", "ORD-00092"]);
});

test("las piezas viejas vuelven: misma pieza neta 0; el butaco viejo vuelve y sale el del lote", () => {
  const plan = planearOrden(base());
  const neto = new Map();
  for (const m of plan.movimientos) neto.set(m.productId, (neto.get(m.productId) ?? 0) + m.change);
  // La salida que ya hizo la orden (-1 por pieza) + estos movimientos = lo que de verdad paso.
  for (const [pieza, ya] of salidas) neto.set(pieza, (neto.get(pieza) ?? 0) - ya);
  assert.deepEqual(Object.fromEntries(neto), { carrito: 0, escalera: 0, divan: 0, corazon: 0, cuadrado: 0 });
  // Entran con el codigo de la ORD-116; el butaco viejo vuelve como ajuste (no es entrada de su compra).
  assert.ok(plan.movimientos.filter((m) => m.type === "IN").every((m) => m.purchaseCode === "COM-00050"));
  assert.deepEqual(plan.movimientos.find((m) => m.productId === "cuadrado"), {
    productId: "cuadrado",
    type: "ADJUSTMENT",
    change: 1,
    purchaseCode: null,
    note: "Vuelve al inventario: corrección ORD-119 (la pieza salió del lote ORD-116)",
  });
  assert.equal(plan.movimientos.find((m) => m.type === "OUT").note, "Salida por orden ORD-00119");
  assert.equal(plan.piezas[3].productoDespues, "corazon");
});

test("una unidad que ya llegó (en inventario) no vuelve a entrar", () => {
  const input = base();
  input.unidades[0].estado = "EN_INVENTARIO";
  const plan = planearOrden(input);
  assert.equal(plan.unidad.necesitaLlegada, false);
  assert.ok(plan.movimientos.every((m) => m.type !== "IN"));
});

test("una unidad ya vendida a otra orden se rechaza", () => {
  const input = base();
  input.unidades[0] = { ...input.unidades[0], estado: "VENDIDA", saleOrderId: "otra" };
  assert.equal(planearOrden({ ...input, unidadForzada: "u1" }).estado, "error");
  // Sin otra unidad negra libre, se detiene en vez de tomar la palo de rosa.
  const plan = planearOrden(input);
  assert.equal(plan.estado, "error");
  assert.match(plan.motivo, /no hay una unidad libre/);
});

test("segunda corrida: ya corregida, nada que cambiar", () => {
  const corregida = orden({
    items: [
      item("i1", "carrito", 90000, COMPRA),
      item("i2", "escalera", 40000, COMPRA),
      item("i3", "divan", 230000, COMPRA),
      item("i4", "corazon", 220000, COMPRA),
    ],
  });
  const input = { ...base(), orden: corregida, salidas: new Map([...salidas, ["corazon", 1]]) };
  input.unidades[0] = { ...input.unidades[0], estado: "VENDIDA", saleOrderId: "o119" };
  const plan = planearOrden(input);
  assert.equal(plan.estado, "nada");
  assert.deepEqual(plan.movimientos, []);
  assert.ok(lineasDeOrden("ORD-00119", "SAL-00108", plan, (id) => id).some((l) => l.includes("Nada que cambiar")));
});

test("se niega con orden cancelada, devolución abierta o piezas que no cuadran", () => {
  assert.equal(planearOrden({ ...base(), orden: orden({ status: "CANCELLED" }) }).estado, "error");
  assert.equal(planearOrden({ ...base(), orden: orden({ devolucionesAbiertas: 1 }) }).estado, "error");
  const dosButacos = { ...compra, items: [...compra.items.slice(0, 3), { ...linea("corazon", 220000), quantity: 3 }, { ...linea("cuadrado", 220000), quantity: 3 }] };
  assert.match(planearOrden({ ...base(), compra: dosButacos }).motivo, /no cuadran/);
});

test("conserva el costo de un adicional de la línea", () => {
  const input = base();
  input.orden.items[2] = item("i3", "divan", 245000, "ORD-00099", { notes: meta({ adicionales: [{ descripcion: "base", precio: 50000, costo: 10000 }] }) });
  assert.equal(planearOrden(input).costoTotalDespues, 590000);
});

test("color: palo rosa = palo de rosa; negro no es palo de rosa", () => {
  assert.equal(mismoColor("palo rosa", "Tapizado: Palo de rosa"), true);
  assert.equal(mismoColor("negro", "palo de rosa"), false);
  assert.equal(mismoColor(null, "negro"), false);
  assert.deepEqual([...leerUnidadesForzadas(["--unidad=ORD-00119:abc_1"])], [["ORD-00119", "abc_1"]]);
});

test("con --aplicar y sin --tarjeta se niega antes de conectarse", () => {
  const run = spawnSync(process.execPath, [SCRIPT, "--aplicar"], {
    env: { ...process.env, DATABASE_URL: "postgresql://nadie:nada@127.0.0.1:1/no_usar" },
    encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Falta --tarjeta T-xxx/);
  assert.equal(run.stdout, "");
});
