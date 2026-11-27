// Correccion de UNA SOLA VEZ (nov-2026): las ventas ORD-00119 (SAL-00108, combo negro) y ORD-00121
// (SAL-00112, combo palo rosa) eran combos del lote ORD-00116 (6 combos a 580.000 de Laura), pero al
// confirmarlas por stock Gestion saco piezas viejas (ORD-00099 y ORD-00092) y puso el butaco alterno.
//
// Que hace, por orden y en una transaccion:
//  1. Toma una unidad del lote ORD-00116 del color de la venta (o la que ya este vendida a esa orden).
//     Si todavia no habia llegado, registra su llegada (entran sus piezas con el codigo de la ORD-00116).
//     La marca VENDIDA con esa orden: asi no se puede volver a marcar "Llego" y no sobra un combo.
//  2. Las piezas viejas vuelven al inventario: la salida que ya hizo la orden pasa a ser la salida de la
//     pieza del lote (mismo producto). Si la pieza del lote es otro producto (el butaco), la vieja vuelve
//     con un AJUSTE +1 y la del lote sale con "Salida por orden ORD-...". El ajuste no es una entrada de
//     compra: no descuadra la ORD-00099/ORD-00092 en el revisor y el costo FIFO de lo que queda en bodega
//     sigue saliendo de sus compras (no del catalogo).
//  3. Cambia el producto de la linea (orden y cotizacion) al de la ORD-00116 y le pone el costo de esa
//     compra (mas el costo de sus adicionales, si tiene) con origen "ORD-00116".
// No toca precios, abonos, cuentas, despachos, comisiones ni la deuda con la proveedora.
//
// Por defecto SOLO SIMULA. Escribe unicamente con --aplicar --tarjeta T-xxx (firma en ActivityLog por orden).
// Se puede correr dos veces: si la orden ya esta corregida, dice "Nada que cambiar".
// Opciones: --unidad=ORD-00119:<idUnidad> para escoger la unidad a mano; --cambiar-en-despacho para seguir
// aunque la pieza que cambia de producto ya este en un despacho (lo decide Alex).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { exigirTarjeta, firmar } from "./firma.mjs";

export const COMPRA = "ORD-00116";
export const ORDENES = [
  { orden: "ORD-00119", venta: "SAL-00108" },
  { orden: "ORD-00121", venta: "SAL-00112" },
];
export const PREFIJO_SALIDA = "Salida por orden ";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const sinCeros = (code) => String(code ?? "").replace(/^([A-Z]+)-0*(\d+)$/i, (_, p, d) => `${p.toUpperCase()}-${Number(d)}`);
export const money = (n) => `$${Math.round(n).toLocaleString("es-CO")}`;
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "y"]);
const palabras = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !PALABRAS_VACIAS.has(p));

/** Lee las notas JSON de una linea (quote-item-meta); {} si no son JSON. */
export function leerMeta(notes) {
  try {
    const meta = JSON.parse(notes ?? "");
    return meta && meta._type === "quote-item-meta" ? meta : {};
  } catch {
    return {};
  }
}

/** Texto de color de la linea: el color y el de cada parte. */
export function colorDeLinea(notes) {
  const meta = leerMeta(notes);
  const partes = Array.isArray(meta.partes) ? meta.partes.map((p) => p?.color ?? "") : [];
  return [meta.color ?? "", ...partes].filter(Boolean).join(" ");
}

/** La unidad es del color de la venta si todas las palabras de su color estan en el color de la venta. */
export function mismoColor(colorUnidad, colorVenta) {
  const deUnidad = palabras(colorUnidad);
  const deVenta = new Set(palabras(colorVenta));
  return deUnidad.length > 0 && deUnidad.every((p) => deVenta.has(p));
}

const ORDEN_ESTADO = { EN_INVENTARIO: 0, FABRICANDO: 1, PENDIENTE: 2 };

/**
 * Regla pura: que hay que hacer con UNA orden. Devuelve { estado: "error" | "nada" | "listo", motivo?, ... }.
 * @param {object} input
 * @param {{ id: string, code: string, status: string, devolucionesAbiertas: number, items: Array<{ id: string,
 *   quoteItemId: string | null, productId: string, quantity: number, fulfillmentMode: string, confirmedAt: Date | null,
 *   purchaseCost: number | null, stockCostSource: string | null, notes: string | null, despachos: string[] }> }} input.orden
 * @param {{ code: string, purchaseCode: string | null, items: Array<{ productId: string, quantity: number,
 *   purchaseCost: number | null, notes: string | null }> }} input.compra
 * @param {{ id: string, code: string, name: string, components: Array<{ childId: string, quantity: number,
 *   alternates: string[] }> }} input.combo
 * @param {Array<{ id: string, estado: string, color: string | null, saleOrderId: string | null }>} input.unidades
 *   Unidades del combo en la compra, en orden de creacion.
 * @param {Map<string, number>} input.salidas Unidades que salieron con "Salida por orden <code>", por producto.
 * @param {string | null} [input.unidadForzada] Id de la unidad escogida a mano.
 * @param {Set<string>} [input.tomadas] Unidades ya escogidas por otra orden en esta corrida.
 */
export function planearOrden({ orden, compra, combo, unidades, salidas, unidadForzada = null, tomadas = new Set() }) {
  const error = (motivo) => ({ estado: "error", motivo });
  if (orden.status === "CANCELLED") return error(`la ${orden.code} está cancelada`);
  if (orden.devolucionesAbiertas > 0) return error(`la ${orden.code} tiene una devolución abierta`);

  const componenteDe = (productId) =>
    combo.components.findIndex((c) => c.childId === productId || c.alternates.includes(productId));

  // Piezas de UN combo en la compra (lineas "Combo <nombre>"), una por componente.
  if (unidades.length === 0) return error(`la ${compra.code} no tiene unidades del ${combo.code}`);
  const lineasLote = compra.items.filter((i) => i.notes === `Combo ${combo.name}`);
  const piezasLote = [];
  for (const [index, componente] of combo.components.entries()) {
    const lineas = lineasLote.filter((i) => componenteDe(i.productId) === index);
    const productos = new Set(lineas.map((i) => i.productId));
    if (productos.size !== 1) {
      return error(`las piezas no cuadran con la ${compra.code}: la pieza ${index + 1} del combo tiene ${productos.size} productos distintos en la compra`);
    }
    const cantidad = lineas.reduce((s, i) => s + i.quantity, 0);
    if (cantidad !== componente.quantity * unidades.length || lineas.some((i) => i.purchaseCost === null)) {
      return error(`las piezas no cuadran con la ${compra.code}: la pieza ${index + 1} tiene ${cantidad} unidades para ${unidades.length} combos`);
    }
    const total = lineas.reduce((s, i) => s + Number(i.purchaseCost) * i.quantity, 0);
    piezasLote.push({ productId: lineas[0].productId, cantidad: componente.quantity, costo: round2(total / cantidad) });
  }
  if (lineasLote.some((i) => componenteDe(i.productId) < 0)) {
    return error(`las piezas no cuadran con la ${compra.code}: trae una pieza que no es del ${combo.code}`);
  }

  // Lineas del combo en la venta: las marcadas con su codigo; si no hay marca, las piezas del combo.
  const marcadas = orden.items.filter((i) => leerMeta(i.notes).comboCode === combo.code);
  const lineas = marcadas.length > 0 ? marcadas : orden.items.filter((i) => componenteDe(i.productId) >= 0);
  if (lineas.length !== combo.components.length) {
    return error(`la ${orden.code} no tiene un solo ${combo.code} (${lineas.length} piezas)`);
  }
  const piezas = [];
  for (const linea of lineas) {
    const index = componenteDe(linea.productId);
    if (index < 0 || piezas.some((p) => p.index === index)) return error(`la ${orden.code} no tiene un solo ${combo.code}`);
    const lote = piezasLote[index];
    if (linea.quantity !== lote.cantidad) return error(`la ${orden.code} lleva ${linea.quantity} de la pieza ${index + 1}; el combo lleva ${lote.cantidad}`);
    if (linea.fulfillmentMode !== "STOCK" || linea.confirmedAt === null) {
      return error(`la ${orden.code} tiene una pieza que no salió del stock (no está confirmada por stock)`);
    }
    if ((salidas.get(linea.productId) ?? 0) < linea.quantity) {
      return error(`la ${orden.code} no tiene la salida de inventario de una de sus piezas`);
    }
    const adicionales = leerMeta(linea.notes).adicionales;
    const costoAdicionales = Array.isArray(adicionales) ? adicionales.reduce((s, a) => s + (Number(a?.costo) || 0), 0) : 0;
    piezas.push({
      index,
      itemId: linea.id,
      quoteItemId: linea.quoteItemId,
      cantidad: linea.quantity,
      productoAntes: linea.productId,
      productoDespues: lote.productId,
      costoAntes: Number(linea.purchaseCost ?? 0),
      costoDespues: round2(lote.costo + costoAdicionales / linea.quantity),
      origenAntes: linea.stockCostSource ?? "sin dato",
      despachos: linea.despachos,
    });
  }
  piezas.sort((a, b) => a.index - b.index);
  const colorVenta = lineas.map((l) => colorDeLinea(l.notes)).join(" ");

  // Unidad del lote.
  const ligadas = unidades.filter((u) => u.saleOrderId === orden.id);
  if (ligadas.length > 1) return error(`la ${orden.code} tiene ${ligadas.length} unidades del lote vendidas`);
  let unidad = ligadas[0] ?? null;
  if (unidadForzada && unidad && unidad.id !== unidadForzada) {
    return error(`la ${orden.code} ya tiene otra unidad del lote vendida (${unidad.id})`);
  }
  if (!unidad && unidadForzada) {
    unidad = unidades.find((u) => u.id === unidadForzada) ?? null;
    if (!unidad) return error(`la unidad ${unidadForzada} no es del lote ${compra.code}`);
    if (unidad.estado === "VENDIDA") return error(`la unidad ${unidad.id} ya está vendida a otra orden`);
    if (tomadas.has(unidad.id)) return error(`la unidad ${unidad.id} ya la tomó otra orden en esta corrida`);
  }
  if (!unidad) {
    const candidatas = unidades
      .filter((u) => u.estado !== "VENDIDA" && !tomadas.has(u.id) && mismoColor(u.color, colorVenta))
      .sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9));
    if (candidatas.length === 0) {
      return error(`no hay una unidad libre del lote ${compra.code} con el color de la venta («${colorVenta || "sin color"}»); escoge una con --unidad=${orden.code}:<id>`);
    }
    unidad = candidatas[0];
  }

  const yaCorregida =
    unidad.saleOrderId === orden.id &&
    piezas.every((p) => p.productoAntes === p.productoDespues && p.costoAntes === p.costoDespues && p.origenAntes === compra.code);
  const base = {
    piezas,
    colorVenta,
    unidad: { id: unidad.id, estadoAntes: unidad.estado, color: unidad.color },
    costoTotalAntes: round2(piezas.reduce((s, p) => s + p.costoAntes * p.cantidad, 0)),
    costoTotalDespues: round2(piezas.reduce((s, p) => s + p.costoDespues * p.cantidad, 0)),
  };
  if (yaCorregida) return { estado: "nada", ...base, movimientos: [], avisos: [] };

  // VENDIDA o EN_INVENTARIO ya pasaron por "Llegó": sus piezas ya entraron.
  const necesitaLlegada = unidad.estado === "PENDIENTE" || unidad.estado === "FABRICANDO";
  const movimientos = [];
  if (necesitaLlegada) {
    for (const p of piezasLote) {
      movimientos.push({
        productId: p.productId,
        type: "IN",
        change: p.cantidad,
        purchaseCode: compra.purchaseCode,
        note: `Compra ${sinCeros(compra.code)} (llegó unidad del lote; salió en la ${sinCeros(orden.code)})`,
      });
    }
  }
  const avisos = [];
  for (const p of piezas) {
    if (p.productoAntes === p.productoDespues) continue;
    movimientos.push({
      productId: p.productoAntes,
      type: "ADJUSTMENT",
      change: p.cantidad,
      purchaseCode: null,
      note: `Vuelve al inventario: corrección ${sinCeros(orden.code)} (la pieza salió del lote ${sinCeros(compra.code)})`,
    });
    movimientos.push({ productId: p.productoDespues, type: "OUT", change: -p.cantidad, purchaseCode: null, note: `${PREFIJO_SALIDA}${orden.code}` });
    if (p.despachos.length > 0) avisos.push({ despacho: true, texto: `la pieza que cambia de producto ya va en el despacho ${p.despachos.join(", ")}: su guía dirá el producto nuevo` });
  }
  if (orden.status === "COMPLETED") avisos.push({ despacho: false, texto: `la ${orden.code} ya está entregada: la ganancia cambia en el mes de la entrega` });
  return { estado: "listo", ...base, unidad: { ...base.unidad, necesitaLlegada }, movimientos, avisos };
}

/** Lineas que se imprimen para una orden. `nombre(id)` da "CODIGO Nombre" del producto. */
export function lineasDeOrden(codigo, venta, plan, nombre) {
  if (plan.estado === "error") return [`${codigo} (${venta}): NO SE TOCA — ${plan.motivo}.`];
  const salida = [`${codigo} (${venta}):`];
  for (const p of plan.piezas) {
    if (p.productoAntes === p.productoDespues) {
      salida.push(`  - ${nombre(p.productoAntes)} x${p.cantidad}: vuelve al inventario la que salió de ${p.origenAntes}; sale la de la ${COMPRA}`);
    } else {
      salida.push(`  - Butaco/pieza: ${nombre(p.productoAntes)} (de ${p.origenAntes}) vuelve al inventario → ${nombre(p.productoDespues)} (de la ${COMPRA})`);
    }
    salida.push(`      costo ${money(p.costoAntes)} → ${money(p.costoDespues)}`);
  }
  const u = plan.unidad;
  salida.push(
    `  Unidad del lote ${COMPRA}: ${u.id} (${u.estadoAntes}${u.color ? ` · ${u.color}` : ""}) → VENDIDA en ${codigo}` +
      (u.necesitaLlegada ? "; se registra su llegada" : ""),
  );
  salida.push(`  Costo total: ${money(plan.costoTotalAntes)} → ${money(plan.costoTotalDespues)}`);
  for (const a of plan.avisos ?? []) salida.push(`  OJO: ${a.texto}`);
  if (plan.estado === "nada") salida.push("  Nada que cambiar: ya está corregida.");
  return salida;
}

/** --unidad=ORD-00119:<id> → Map(orden → id). */
export function leerUnidadesForzadas(argv) {
  const mapa = new Map();
  for (const arg of argv) {
    const m = /^--unidad=([A-Z]+-\d+):([A-Za-z0-9_-]+)$/.exec(arg);
    if (m) mapa.set(m[1], m[2]);
  }
  return mapa;
}

async function main() {
  const argv = process.argv;
  const aplicar = argv.includes("--aplicar");
  const tarjeta = exigirTarjeta(argv); // antes de conectarse a la base
  const enDespacho = argv.includes("--cambiar-en-despacho");
  const forzadas = leerUnidadesForzadas(argv);

  if (!process.env.DATABASE_URL) {
    try {
      const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
      const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
      if (match) process.env.DATABASE_URL = match[1];
    } catch {
      // sin .env: se confia en el entorno
    }
  }
  const [{ PrismaClient }, { PrismaPg }, { Pool }] = await Promise.all([
    import("@prisma/client"),
    import("@prisma/adapter-pg"),
    import("pg"),
  ]);
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

  try {
    const compraRow = await prisma.order.findUnique({
      where: { code: COMPRA },
      select: { id: true, code: true, type: true, purchaseCode: true, items: { select: { productId: true, quantity: true, purchaseCost: true, notes: true } } },
    });
    if (!compraRow || compraRow.type !== "PURCHASE") throw new Error(`La ${COMPRA} no existe o no es una compra. No se tocó nada.`);
    const combosDelLote = await prisma.compraUnidad.groupBy({ by: ["productId"], where: { orderId: compraRow.id } });
    if (combosDelLote.length !== 1) throw new Error(`La ${COMPRA} tiene ${combosDelLote.length} productos en lote (se esperaba 1 combo). No se tocó nada.`);
    const comboRow = await prisma.product.findUnique({
      where: { id: combosDelLote[0].productId },
      select: {
        id: true,
        code: true,
        name: true,
        isBundle: true,
        bundleComponents: { orderBy: { sortOrder: "asc" }, select: { childId: true, quantity: true, alternates: { select: { productId: true } } } },
      },
    });
    if (!comboRow?.isBundle) throw new Error(`El producto del lote ${COMPRA} no es un combo. No se tocó nada.`);
    const combo = {
      id: comboRow.id,
      code: comboRow.code ?? comboRow.name,
      name: comboRow.name,
      components: comboRow.bundleComponents.map((c) => ({ childId: c.childId, quantity: c.quantity, alternates: c.alternates.map((a) => a.productId) })),
    };
    const compra = {
      code: compraRow.code,
      purchaseCode: compraRow.purchaseCode,
      items: compraRow.items.map((i) => ({ ...i, purchaseCost: i.purchaseCost === null ? null : Number(i.purchaseCost) })),
    };
    const unidadesQuery = () =>
      prisma.compraUnidad.findMany({
        where: { orderId: compraRow.id, productId: combo.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, estado: true, color: true, saleOrderId: true },
      });
    const unidades = await unidadesQuery();
    console.log(`Lote ${COMPRA} (${combo.code} ${combo.name}): ${unidades.map((u) => `${u.estado}${u.color ? ` · ${u.color}` : ""}`).join(" | ")}`);

    const productos = new Map(
      (await prisma.product.findMany({
        where: { id: { in: [...new Set(combo.components.flatMap((c) => [c.childId, ...c.alternates]))] } },
        select: { id: true, code: true, name: true },
      })).map((p) => [p.id, `${p.code ?? ""} ${p.name}`.trim()]),
    );
    const nombre = (id) => productos.get(id) ?? id;

    const cargarOrden = async (codigo, db) => {
      const row = await db.order.findUnique({
        where: { code: codigo },
        select: {
          id: true,
          code: true,
          type: true,
          status: true,
          sale: { select: { code: true } },
          returns: { select: { closedAt: true, annulledAt: true } },
          items: {
            select: {
              id: true,
              quoteItemId: true,
              productId: true,
              quantity: true,
              fulfillmentMode: true,
              confirmedAt: true,
              purchaseCost: true,
              stockCostSource: true,
              notes: true,
              quoteItem: { select: { notes: true } },
              dispatchItems: { where: { dispatch: { status: { not: "CANCELLED" } } }, select: { dispatch: { select: { code: true } } } },
            },
          },
        },
      });
      if (!row) return null;
      const salidasRows = await db.inventoryMovement.groupBy({
        by: ["productId"],
        where: { type: "OUT", note: `${PREFIJO_SALIDA}${codigo}` },
        _sum: { change: true },
      });
      return {
        row,
        orden: {
          id: row.id,
          code: row.code,
          status: row.status,
          devolucionesAbiertas: row.returns.filter((r) => r.closedAt === null && r.annulledAt === null).length,
          items: row.items.map((i) => ({
            id: i.id,
            quoteItemId: i.quoteItemId,
            productId: i.productId,
            quantity: i.quantity,
            fulfillmentMode: i.fulfillmentMode,
            confirmedAt: i.confirmedAt,
            purchaseCost: i.purchaseCost === null ? null : Number(i.purchaseCost),
            stockCostSource: i.stockCostSource,
            notes: i.notes ?? i.quoteItem?.notes ?? null,
            despachos: i.dispatchItems.map((d) => sinCeros(d.dispatch.code ?? "")),
          })),
        },
        salidas: new Map(salidasRows.map((s) => [s.productId, -(s._sum.change ?? 0)])),
      };
    };

    const planes = [];
    const tomadas = new Set();
    for (const { orden: codigo, venta } of ORDENES) {
      const cargada = await cargarOrden(codigo, prisma);
      let plan;
      if (!cargada) plan = { estado: "error", motivo: `no existe la ${codigo}` };
      else if (cargada.row.type !== "SALE" || cargada.row.sale?.code !== venta) plan = { estado: "error", motivo: `la ${codigo} no es la venta ${venta}` };
      else plan = planearOrden({ orden: cargada.orden, compra, combo, unidades, salidas: cargada.salidas, unidadForzada: forzadas.get(codigo) ?? null, tomadas });
      if (plan.unidad) tomadas.add(plan.unidad.id);
      planes.push({ codigo, venta, plan, orderId: cargada?.row.id });
      for (const linea of lineasDeOrden(codigo, venta, plan, nombre)) console.log(linea);
      if (plan.movimientos?.length) {
        for (const m of plan.movimientos) console.log(`      movimiento ${m.type} ${m.change > 0 ? "+" : ""}${m.change} ${nombre(m.productId)} — ${m.note}`);
      }
    }

    if (!aplicar) {
      console.log("\nSIMULACIÓN: no se escribió nada. Usa --aplicar --tarjeta T-xxx para escribir.");
      return;
    }
    const aplicables = planes.filter((p) => p.plan.estado === "listo");
    if (aplicables.length === 0) {
      console.log("\nNada que cambiar.");
      return;
    }
    const conDespacho = aplicables.filter((p) => p.plan.avisos.some((a) => a.despacho));
    if (conDespacho.length > 0 && !enDespacho) {
      console.error(`\nNo se escribió nada: ${conDespacho.map((p) => p.codigo).join(", ")} cambia una pieza que ya va en un despacho. Si Alex dice que sí, corre otra vez con --cambiar-en-despacho.`);
      process.exitCode = 1;
      return;
    }
    const actor = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!actor) throw new Error("No hay un usuario ADMIN para registrar los movimientos. No se escribió nada.");

    await prisma.$transaction(async (tx) => {
      for (const { codigo, venta, plan: simulado } of aplicables) {
        // Candado y se vuelve a planear dentro de la transaccion: si algo cambio desde la simulacion, se frena.
        await tx.$queryRaw`SELECT "id" FROM "CompraUnidad" WHERE "orderId" = ${compraRow.id} FOR UPDATE`;
        const cargada = await cargarOrden(codigo, tx);
        const unidadesTx = await tx.compraUnidad.findMany({
          where: { orderId: compraRow.id, productId: combo.id },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, estado: true, color: true, saleOrderId: true },
        });
        const plan = planearOrden({ orden: cargada.orden, compra, combo, unidades: unidadesTx, salidas: cargada.salidas, unidadForzada: simulado.unidad.id });
        if (plan.estado !== "listo") throw new Error(`${codigo}: cambió desde la simulación (${plan.motivo ?? plan.estado}). No se escribió nada.`);

        for (const m of plan.movimientos) {
          await tx.inventoryMovement.create({
            data: { productId: m.productId, type: m.type, change: m.change, note: m.note, purchaseCode: m.purchaseCode, createdById: actor.id },
          });
        }
        await tx.compraUnidad.update({
          where: { id: plan.unidad.id },
          data: { estado: "VENDIDA", saleOrderId: cargada.orden.id, ...(plan.unidad.color ? {} : { color: plan.colorVenta.slice(0, 60) || null }) },
        });
        for (const p of plan.piezas) {
          await tx.orderItem.update({
            where: { id: p.itemId },
            data: { productId: p.productoDespues, purchaseCost: p.costoDespues, stockCostSource: COMPRA },
          });
          if (p.quoteItemId && p.productoAntes !== p.productoDespues) {
            await tx.quoteItem.update({ where: { id: p.quoteItemId }, data: { productId: p.productoDespues } });
          }
        }
        await firmar(tx, {
          script: "corregir-combos-lote-ord-116",
          tarjeta,
          entityCode: codigo,
          resumen: `Corrigió ${codigo} (${venta}): sale del lote ${COMPRA} (unidad ${plan.unidad.id}); costo ${money(plan.costoTotalAntes)} → ${money(plan.costoTotalDespues)}; las piezas viejas vuelven al inventario`,
          after: {
            unidad: plan.unidad,
            piezas: plan.piezas.map((p) => ({ item: p.itemId, antes: p.productoAntes, despues: p.productoDespues, costoAntes: p.costoAntes, costoDespues: p.costoDespues, origenAntes: p.origenAntes })),
            movimientos: plan.movimientos,
          },
        });
      }
    });
    console.log(`\nListo: ${aplicables.map((p) => p.codigo).join(", ")} corregida(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
