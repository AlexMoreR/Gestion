import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redireccion, carpetaTemporal, comprobante, llamar } from "./helpers";

// "Listo para despacho" de la proveedora (/fabricacion/<token>): acción pública, solo con el enlace de la OF.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redireccion(url);
  },
}));
vi.mock("server-only", () => ({}));
// La acción de la proveedora no usa sesión; el despacho del admin (último caso) sí.
const sesionAdmin: { user: { id: string; role: "ADMIN" } | null } = { user: null };
vi.mock("@/auth", () => ({ auth: async () => (sesionAdmin.user ? { user: sesionAdmin.user } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

const { prisma } = await import("@/lib/prisma");
const { markReadyForDispatchAction } = await import("@/app/actions/manufacturing-order-actions");
const { adminDispatchOrderItemAction } = await import("@/app/actions/dispatch-actions");

// Datos propios con códigos PRB- (no chocan con los consecutivos ORD/OF/DES) y se borran al final:
// la base es compartida con las otras pruebas de tests/db.
const datos: {
  token: string;
  itemId: string;
  otroItemId: string;
  despachadoId: string;
  otroToken: string;
  listoId: string;
  ordenId: string;
  transportadoraId: string;
} = {
  listoId: "",
  ordenId: "",
  transportadoraId: "",
  token: "tok-embalaje-a",
  itemId: "",
  otroItemId: "",
  despachadoId: "",
  otroToken: "tok-embalaje-b",
};

async function crearItem(orderId: string, productId: string, supplierId: string) {
  const item = await prisma.orderItem.create({
    data: {
      orderId,
      productId,
      quantity: 1,
      unitPrice: 300_000,
      lineTotal: 300_000,
      fulfillmentMode: "MANUFACTURE",
      confirmedSupplierId: supplierId,
    },
  });
  return item.id;
}

beforeAll(async () => {
  carpetaTemporal();
  const admin = await prisma.user.create({
    data: { name: "Admin embalaje", email: "embalaje@prueba.local", role: "ADMIN", password: "sin-uso" },
  });
  const rosa = await prisma.supplier.create({ data: { name: "Rosa embalaje", type: "MANUFACTURER" } });
  const laura = await prisma.supplier.create({ data: { name: "Laura embalaje", type: "MANUFACTURER" } });
  const producto = await prisma.product.create({
    data: { code: "EMB-PRUEBA", name: "Camilla embalaje", slug: "camilla-embalaje", thumbnailUrl: "/sin-foto.png", price: 300_000, baseCost: 100_000 },
  });
  const orden = await prisma.order.create({ data: { code: "PRB-EMB01", createdById: admin.id } });
  const otraOrden = await prisma.order.create({ data: { code: "PRB-EMB02", createdById: admin.id } });
  datos.itemId = await crearItem(orden.id, producto.id, rosa.id);
  datos.despachadoId = await crearItem(orden.id, producto.id, rosa.id);
  datos.otroItemId = await crearItem(otraOrden.id, producto.id, laura.id);
  // Listo para que el admin lo despache: costo confirmado, foto del terminado y pago marcado.
  datos.listoId = await crearItem(orden.id, producto.id, rosa.id);
  await prisma.orderItem.update({
    where: { id: datos.listoId },
    data: { purchaseCost: 100_000, supplierPaymentStatus: "PENDING", photos: { create: { url: "/uploads/x.jpg" } } },
  });
  datos.ordenId = orden.id;
  sesionAdmin.user = { id: admin.id, role: "ADMIN" };
  const transportadora = await prisma.supplier.create({ data: { name: "Envíos embalaje", type: "SHIPPING" } });
  datos.transportadoraId = transportadora.id;
  await prisma.manufacturingOrder.create({
    data: { code: "PRB-OF-EMB01", orderId: orden.id, supplierId: rosa.id, shareToken: datos.token },
  });
  await prisma.manufacturingOrder.create({
    data: { code: "PRB-OF-EMB02", orderId: otraOrden.id, supplierId: laura.id, shareToken: datos.otroToken },
  });
  await prisma.dispatch.create({
    data: {
      code: "PRB-DES-EMB01",
      orderId: orden.id,
      status: "SHIPPED",
      createdById: admin.id,
      items: { create: { orderItemId: datos.despachadoId, quantity: 1 } },
    },
  });
});

afterAll(async () => {
  const ordenes = { code: { in: ["PRB-EMB01", "PRB-EMB02"] } };
  await prisma.dispatch.deleteMany({ where: { order: ordenes } });
  await prisma.manufacturingOrder.deleteMany({ where: { order: ordenes } });
  await prisma.order.deleteMany({ where: ordenes });
  await prisma.product.deleteMany({ where: { code: "EMB-PRUEBA" } });
  await prisma.supplier.deleteMany({ where: { name: { in: ["Rosa embalaje", "Laura embalaje", "Envíos embalaje"] } } });
  await prisma.activityLog.deleteMany({ where: { entityCode: "PRB-OF-EMB01" } });
  await prisma.user.deleteMany({ where: { email: "embalaje@prueba.local" } });
  await prisma.$disconnect();
});

const fotosDe = (orderItemId: string) =>
  prisma.embalajeFoto.findMany({ where: { orderItemId }, orderBy: { createdAt: "asc" } });

describe("markReadyForDispatchAction", () => {
  it("con el enlace y las 2 fotos crea las filas sin despacho y la bitácora", async () => {
    const r = await llamar(markReadyForDispatchAction, {
      token: datos.token,
      orderItemId: datos.itemId,
      embalajeAbierto: comprobante("abierto.png"),
      embalajeCerrado: comprobante("cerrado.png"),
    });
    expect(r.error, r.url).toBeNull();
    expect(r.url.startsWith(`/fabricacion/${datos.token}?`)).toBe(true);
    const fotos = await fotosDe(datos.itemId);
    expect(fotos.map((f) => f.tipo).sort()).toEqual(["ABIERTO", "CERRADO"]);
    for (const foto of fotos) {
      expect(foto.dispatchId).toBeNull();
      expect(foto.subidoPorUserId).toBeNull();
      expect(foto.subidoPorTexto).toBe("Proveedora Rosa embalaje");
    }
    const log = await prisma.activityLog.findFirst({ where: { entityCode: "PRB-OF-EMB01" } });
    expect(log?.summary).toBe("Proveedora subió fotos del embalaje: Camilla embalaje");
  });

  it("un producto de otra OF se rechaza y no crea filas", async () => {
    const r = await llamar(markReadyForDispatchAction, {
      token: datos.token,
      orderItemId: datos.otroItemId,
      embalajeAbierto: comprobante(),
      embalajeCerrado: comprobante(),
    });
    expect(r.error).toBe("Este producto no es de esta orden");
    expect(await fotosDe(datos.otroItemId)).toHaveLength(0);
  });

  it("un enlace falso se rechaza", async () => {
    const r = await llamar(markReadyForDispatchAction, {
      token: "enlace-que-no-existe",
      orderItemId: datos.itemId,
      embalajeAbierto: comprobante(),
      embalajeCerrado: comprobante(),
    });
    expect(r.error).toBe("Este enlace no es válido");
    expect(await fotosDe(datos.itemId)).toHaveLength(2);
  });

  it("con 5 fotos ya guardadas, una más se rechaza", async () => {
    const tres = await llamar(markReadyForDispatchAction, {
      token: datos.token,
      orderItemId: datos.itemId,
      embalajeExtra: comprobante("extra1.png"),
    });
    expect(tres.error, tres.url).toBeNull();
    const form = new FormData();
    form.append("token", datos.token);
    form.append("orderItemId", datos.itemId);
    form.append("embalajeExtra", comprobante("extra2.png"));
    form.append("embalajeExtra", comprobante("extra3.png"));
    await expect(markReadyForDispatchAction(form)).rejects.toThrow(/ok=/);
    expect(await fotosDe(datos.itemId)).toHaveLength(5);

    const r = await llamar(markReadyForDispatchAction, {
      token: datos.token,
      orderItemId: datos.itemId,
      embalajeExtra: comprobante("extra4.png"),
    });
    expect(r.error).toBe("Máximo 5 fotos de embalaje por producto (2 obligatorias + 3 extra)");
    expect(await fotosDe(datos.itemId)).toHaveLength(5);
  });

  it("un producto ya despachado se rechaza", async () => {
    const r = await llamar(markReadyForDispatchAction, {
      token: datos.token,
      orderItemId: datos.despachadoId,
      embalajeAbierto: comprobante(),
      embalajeCerrado: comprobante(),
    });
    expect(r.error).toBe("Este producto ya fue despachado");
    expect(await fotosDe(datos.despachadoId)).toHaveLength(0);
  });

  it("el admin despacha sin volver a subir las fotos de la proveedora y quedan ligadas al despacho", async () => {
    const subida = await llamar(markReadyForDispatchAction, {
      token: datos.token,
      orderItemId: datos.listoId,
      embalajeAbierto: comprobante(),
      embalajeCerrado: comprobante(),
    });
    expect(subida.error, subida.url).toBeNull();
    const r = await llamar(adminDispatchOrderItemAction, {
      returnTo: `/admin/ordenes/${datos.ordenId}`,
      orderId: datos.ordenId,
      orderItemId: datos.listoId,
      deliveryType: "SHIPPING",
      carrierSupplierId: datos.transportadoraId,
      shippingCost: "0",
      estimatedDeliveryAt: "2026-11-20T19:00",
    });
    expect(r.error, r.url).toBeNull();
    const fotos = await fotosDe(datos.listoId);
    expect(fotos).toHaveLength(2);
    const despacho = await prisma.dispatchItem.findFirst({ where: { orderItemId: datos.listoId } });
    for (const foto of fotos) expect(foto.dispatchId).toBe(despacho?.dispatchId);
  });
});
