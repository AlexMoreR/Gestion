import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/** Lo que `redirect` de Next lanza en la prueba: guarda la URL a la que iba. */
export class Redireccion extends Error {
  constructor(public url: string) {
    super(`redirect → ${url}`);
  }
}

/** Sesión simulada (la llena `sembrar`). */
export const sesion: { user: { id: string; role: "ADMIN"; name: string; email: string } | null } = { user: null };

export type Resultado = { url: string; ok: string | null; error: string | null };

/** Llama una server action y devuelve a dónde redirigió, con su ?ok= o ?error=. */
export async function llamar(accion: (form: FormData) => Promise<unknown>, campos: Record<string, unknown>): Promise<Resultado> {
  const form = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    // Listas y objetos van como JSON, igual que los manda la pantalla (p. ej. `items`).
    form.append(clave, valor instanceof Blob ? valor : typeof valor === "string" ? valor : JSON.stringify(valor));
  }
  try {
    await accion(form);
  } catch (error) {
    if (error instanceof Redireccion) {
      const query = new URL(error.url, "http://local").searchParams;
      return { url: error.url, ok: query.get("ok"), error: query.get("error") };
    }
    throw error;
  }
  return { url: "", ok: null, error: null };
}

/** Un comprobante pequeño (PNG de verdad: las acciones revisan los bytes). */
export function comprobante(nombre = "soporte.png"): File {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082",
    "hex",
  );
  return new File([png], nombre, { type: "image/png" });
}

/** Los archivos subidos van a una carpeta temporal, no al repo. */
export function carpetaTemporal(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "gestion-db-"));
  process.chdir(dir);
  return dir;
}

/** Datos base: dueño ADMIN, una cuenta, una proveedora, una transportadora y un producto de stock. */
export async function sembrar() {
  const admin = await prisma.user.create({
    data: { name: "Dueño Prueba", email: "dueno@prueba.local", role: "ADMIN", password: "sin-uso" },
  });
  await prisma.teamMember.create({ data: { fullName: "Dueño Prueba", nameKey: "dueno prueba", userId: admin.id, isOwner: true } });
  sesion.user = { id: admin.id, role: "ADMIN", name: admin.name ?? "", email: admin.email ?? "" };
  const cuenta = await prisma.account.create({
    data: { name: "Banco prueba", type: "BANK", openingBalance: 10_000_000, createdById: admin.id },
  });
  const proveedora = await prisma.supplier.create({ data: { name: "Rosa", type: "MANUFACTURER" } });
  const transportadora = await prisma.supplier.create({ data: { name: "Envíos Ya", type: "SHIPPING" } });
  const producto = await prisma.product.create({
    data: {
      code: "SIL-PRUEBA",
      name: "Silla prueba",
      slug: "silla-prueba",
      thumbnailUrl: "/sin-foto.png",
      price: 300_000,
      baseCost: 100_000,
      suppliers: { create: { supplierId: proveedora.id, supplierCost: 100_000, isPreferred: true } },
    },
  });
  return { admin, cuenta, proveedora, transportadora, producto };
}

export type Foto = {
  codigos: Map<string, string>;
  abonos: { cantidad: number; suma: number };
  pagosProveedora: { cantidad: number; suma: number };
  stock: Map<string, { stock: number; entradas: number; salidas: number }>;
};

/** Lo que se vigila después de cada paso. Los anulados cuentan: se guardan en RegistroAnulado. */
export async function tomarFoto(): Promise<Foto> {
  const [ventas, ordenes, abonos, pagos, anulados, movimientos] = await Promise.all([
    prisma.sale.findMany({ select: { id: true, code: true } }),
    prisma.order.findMany({ select: { id: true, code: true, purchaseCode: true } }),
    prisma.salePayment.findMany({ select: { amount: true } }),
    prisma.supplierLedgerEntry.findMany({ where: { type: "PAYMENT" }, select: { amount: true } }),
    prisma.registroAnulado.findMany({ select: { tabla: true, monto: true, datos: true } }),
    prisma.inventoryMovement.findMany({ select: { productId: true, change: true } }),
  ]);
  const codigos = new Map<string, string>();
  for (const v of ventas) codigos.set(v.id, v.code);
  for (const o of ordenes) codigos.set(o.id, `${o.code}|${o.purchaseCode ?? ""}`);

  const sumar = (filas: { monto: number }[]) => ({
    cantidad: filas.length,
    suma: filas.reduce((total, fila) => total + fila.monto, 0),
  });
  const abonosAnulados = anulados.filter((a) => a.tabla === "SalePayment");
  const pagosAnulados = anulados.filter(
    (a) => a.tabla === "SupplierLedgerEntry" && (a.datos as { type?: string }).type === "PAYMENT",
  );

  const stock = new Map<string, { stock: number; entradas: number; salidas: number }>();
  for (const m of movimientos) {
    const fila = stock.get(m.productId) ?? { stock: 0, entradas: 0, salidas: 0 };
    fila.stock += m.change;
    if (m.change > 0) fila.entradas += m.change;
    else fila.salidas += -m.change;
    stock.set(m.productId, fila);
  }

  return {
    codigos,
    abonos: sumar([...abonos.map((a) => ({ monto: Number(a.amount) })), ...abonosAnulados.map((a) => ({ monto: Number(a.monto) }))]),
    pagosProveedora: sumar([
      ...pagos.map((p) => ({ monto: Number(p.amount) })),
      ...pagosAnulados.map((p) => ({ monto: Number(p.monto) })),
    ]),
    stock,
  };
}
