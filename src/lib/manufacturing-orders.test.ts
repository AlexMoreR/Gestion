import { describe, expect, it, vi } from "vitest";

// Vitest no resuelve "@/": se redirigen los imports del modulo.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/quote-item-meta", async () => await import("./quote-item-meta"));
vi.mock("@/lib/manufacturing-share-token", async () => await import("./manufacturing-share-token"));

import { prisma } from "@/lib/prisma";
import { todayInColombia } from "./colombia-time";
import { stringifyQuoteItemMeta } from "./quote-item-meta";
import { sumarDias } from "./delivery-tracking";
import {
  destinationCityLabel,
  fijarFechaFabricacion,
  mensajeOFProveedora,
  toManufacturingLine,
  ofTodaDespachada,
  proveedorasDelLote,
  supplierPaymentLabel,
} from "./manufacturing-orders";

describe("destinationCityLabel", () => {
  it("une ciudad y departamento", () => {
    expect(destinationCityLabel({ city: " Ocaña ", department: "Norte de Santander " })).toBe(
      "Ocaña, Norte de Santander",
    );
  });

  it("devuelve solo la ciudad si falta el departamento", () => {
    expect(destinationCityLabel({ city: "Cali", department: null })).toBe("Cali");
  });

  it("devuelve solo el departamento si falta la ciudad", () => {
    expect(destinationCityLabel({ city: "  ", department: "Valle del Cauca" })).toBe("Valle del Cauca");
  });

  it("devuelve null si los dos estan vacios o en blanco", () => {
    expect(destinationCityLabel({ city: "", department: "   " })).toBeNull();
    expect(destinationCityLabel({})).toBeNull();
  });

  it("devuelve null sin cliente", () => {
    expect(destinationCityLabel(null)).toBeNull();
    expect(destinationCityLabel(undefined)).toBeNull();
  });

  it("no usa la direccion ni el barrio aunque vengan en el objeto", () => {
    const client = { city: "Ocaña", department: "Norte de Santander", address: "Cra 1 #2-3", neighborhood: "Centro" };
    expect(destinationCityLabel(client)).toBe("Ocaña, Norte de Santander");
  });
});

describe("supplierPaymentLabel", () => {
  it("venta 50% y 50%: se paga de una vez", () => {
    expect(supplierPaymentLabel("ANTICIPO_50_50")).toBe("Pago: se te paga de una vez");
  });

  it("pago total: se paga de una vez, igual que el 50/50", () => {
    expect(supplierPaymentLabel("PAGO_TOTAL")).toBe("Pago: se te paga de una vez");
  });

  it("contraentrega: se paga cuando le llegue al cliente", () => {
    expect(supplierPaymentLabel("CONTRAENTREGA")).toBe(
      "Pago: contraentrega, se te paga cuando el producto le llegue al cliente",
    );
  });

  it("sin definir o sin venta: por confirmar", () => {
    expect(supplierPaymentLabel(null)).toBe("Pago: por confirmar");
    expect(supplierPaymentLabel(undefined)).toBe("Pago: por confirmar");
  });
});

describe("ofTodaDespachada", () => {
  const fab = (supplier: string | null, statuses: string[], mode = "MANUFACTURE") => ({
    confirmedSupplierId: supplier,
    fulfillmentMode: mode,
    dispatchStatuses: statuses,
  });

  it("es verdadero cuando todos los productos de la proveedora están en un despacho vivo", () => {
    expect(ofTodaDespachada("laura", [fab("laura", ["PACKING"]), fab("laura", ["CANCELLED", "SHIPPED"])])).toBe(true);
  });

  it("es falso si falta despachar uno de sus productos", () => {
    expect(ofTodaDespachada("laura", [fab("laura", ["PACKING"]), fab("laura", [])])).toBe(false);
  });

  it("un despacho cancelado o devuelto no cuenta", () => {
    expect(ofTodaDespachada("laura", [fab("laura", ["CANCELLED"])])).toBe(false);
    expect(ofTodaDespachada("laura", [fab("laura", ["RETURNED"])])).toBe(false);
  });

  it("ignora productos de otra proveedora y los de stock", () => {
    expect(ofTodaDespachada("laura", [fab("laura", ["DELIVERED"]), fab("ana", []), fab("laura", [], "STOCK")])).toBe(true);
  });

  it("sin productos de la proveedora es falso", () => {
    expect(ofTodaDespachada("laura", [])).toBe(false);
    expect(ofTodaDespachada("laura", [fab("ana", ["PACKING"])])).toBe(false);
  });
});

describe("proveedorasDelLote", () => {
  const item = (o: { modo?: string; confirmada?: string | null; costo?: number | null; proveedoras?: string[] }) => ({
    fulfillmentMode: o.modo ?? "MANUFACTURE",
    confirmedSupplierId: o.confirmada ?? null,
    purchaseCost: o.costo ?? null,
    product: { suppliers: (o.proveedoras ?? ["laura"]).map((supplierId) => ({ supplierId })) },
  });

  it("solo fabricación sin confirmar con proveedora propia, sin repetir y con la primera (preferida)", () => {
    expect(
      proveedorasDelLote([
        item({}),
        item({ proveedoras: ["laura", "ana"] }),
        item({ modo: "MIXED", proveedoras: ["ana"] }),
      ]),
    ).toEqual(["laura", "ana"]);
  });

  it("vacío con stock, ya confirmados o sin proveedora propia (combo)", () => {
    expect(
      proveedorasDelLote([
        item({ modo: "STOCK" }),
        item({ confirmada: "laura", costo: 500 }),
        item({ proveedoras: [] }),
      ]),
    ).toEqual([]);
  });

  it("confirmado sin costo cuenta como sin confirmar (igual que la acción masiva)", () => {
    expect(proveedorasDelLote([item({ confirmada: "laura", costo: null })])).toEqual(["laura"]);
  });
});

describe("fijarFechaFabricacion", () => {
  type Of = { id: string; code: string; orderId: string; supplierId: string; deliveryDate: Date | null; estimatedDeliveryAt: Date | null };
  function baseSimulada(ofs: Of[]) {
    const updates: Array<{ id: string; data: { deliveryDate: Date; estimatedDeliveryAt: Date } }> = [];
    Object.assign(prisma, {
      order: { findUnique: async () => ({ quoteId: "cot1" }) },
      manufacturingOrder: {
        findMany: async ({ where }: { where: { supplierId: { in: string[] } } }) =>
          ofs.filter((of) => where.supplierId.in.includes(of.supplierId)),
        findFirst: async () => ({ code: "OF-00034" }),
        create: async ({ data }: { data: { code: string; orderId: string; supplierId: string } }) => {
          const nueva = { id: `id-${data.supplierId}`, deliveryDate: null, estimatedDeliveryAt: null, ...data };
          ofs.push(nueva);
          return nueva;
        },
        update: async (args: { where: { id: string }; data: { deliveryDate: Date; estimatedDeliveryAt: Date } }) => {
          updates.push({ id: args.where.id, data: args.data });
          return args;
        },
      },
    });
    return { ofs, updates };
  }
  const dia = sumarDias(todayInColombia(), 10);

  it("crea la OF que falta y llena los dos campos", async () => {
    const { ofs, updates } = baseSimulada([]);
    const cambios = await fijarFechaFabricacion("orden1", ["ana"], dia);
    expect(ofs).toHaveLength(1);
    expect(ofs[0].code).toBe("OF-00035");
    expect(updates).toEqual([
      {
        id: "id-ana",
        data: { deliveryDate: new Date(`${dia}T00:00:00.000Z`), estimatedDeliveryAt: new Date(`${dia}T22:00:00.000Z`) },
      },
    ]);
    expect(cambios.map((c) => [c.code, c.antes.estimatedDeliveryAt])).toEqual([["OF-00035", null]]);
  });

  it("no toca una OF que ya tiene ese mismo día (conserva la hora) y cambia la que tiene otro", async () => {
    const mismoDia = new Date(`${dia}T14:00:00.000Z`); // 9:00 a. m. Colombia
    const otroDia = new Date(`${sumarDias(dia, 3)}T22:00:00.000Z`);
    const { updates } = baseSimulada([
      { id: "a", code: "OF-00010", orderId: "orden1", supplierId: "laura", deliveryDate: null, estimatedDeliveryAt: mismoDia },
      { id: "b", code: "OF-00011", orderId: "orden1", supplierId: "ana", deliveryDate: null, estimatedDeliveryAt: otroDia },
    ]);
    const cambios = await fijarFechaFabricacion("orden1", ["laura", "ana"], dia);
    expect(updates.map((u) => u.id)).toEqual(["b"]);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].antes.estimatedDeliveryAt).toEqual(otroDia);
  });

  it("rechaza un día pasado sin escribir nada", async () => {
    const { ofs, updates } = baseSimulada([]);
    await expect(fijarFechaFabricacion("orden1", ["ana"], sumarDias(todayInColombia(), -1))).rejects.toThrow();
    expect(ofs).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

describe("mensajeOFProveedora", () => {
  // Una línea real de la OF (con costo) y una clienta con todos sus datos: solo debe salir la ciudad.
  const clienta = {
    name: "Marta Gómez",
    phone: "3125550000",
    address: "Cra 1 #2-3",
    neighborhood: "Centro",
    city: "Ocaña",
    department: "Norte de Santander",
  };
  const linea = toManufacturingLine({
    id: "i1",
    quantity: 1,
    purchaseCost: 580000,
    notes: null,
    product: { name: "Camilla diván", code: "CAV-16", thumbnailUrl: "", description: null },
  });

  it("arma el saludo, las partes, la cantidad, destino, notas, entrega y enlace", () => {
    const texto = mensajeOFProveedora({
      proveedora: "Laura",
      ofCode: "OF-00035",
      orderCode: "ORD-00120",
      lineas: [
        { ...linea, partesTexto: "Estructura: Negra · Tapizado: Negro" },
        { ...linea, productName: "Butaco", color: "negro", quantity: 2 },
      ],
      destino: destinationCityLabel(clienta),
      notas: " Sin brazos ",
      entrega: new Date("2026-11-28T00:00:00.000Z"),
      enlace: "https://magilus.com/fabricacion/tok123",
    });
    expect(texto).toBe(
      [
        "Hola Laura, te mando la orden OF-35 (ORD-120) para fabricar:",
        "- Camilla diván · Estructura: Negra · Tapizado: Negro · Cantidad: 1",
        "- Butaco · negro · Cantidad: 2",
        "Destino: Ocaña, Norte de Santander",
        "Notas: Sin brazos",
        "Entrega: 28/11/2026",
        "https://magilus.com/fabricacion/tok123",
      ].join("\n"),
    );
    // Nunca datos de la clienta ni precios.
    for (const prohibido of ["Marta", "3125550000", "Cra 1", "Centro", "580", "$"]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it("sin destino, notas ni fecha no deja líneas vacías", () => {
    const texto = mensajeOFProveedora({
      proveedora: "Laura",
      ofCode: "OF-00001",
      orderCode: "ORD-00002",
      lineas: [linea],
      destino: null,
      notas: "  ",
      entrega: null,
      enlace: "https://magilus.com/fabricacion/x",
    });
    expect(texto).toBe(
      "Hola Laura, te mando la orden OF-1 (ORD-2) para fabricar:\n- Camilla diván · Cantidad: 1\nhttps://magilus.com/fabricacion/x",
    );
  });
});

describe("toManufacturingLine con adicionales", () => {
  const notas = stringifyQuoteItemMeta({
    color: "negro",
    adicionales: [
      { descripcion: "Base cromada", precio: 50000, costo: 30000, porId: "u1", porNombre: "Ingrid", en: "2026-11-20T15:00:00.000Z" },
      { descripcion: "Bordado", precio: 20000, costo: 0, porId: "u1", porNombre: "Ingrid", en: "2026-11-20T15:00:00.000Z" },
    ],
  });
  // purchaseCost ya trae sumado el costo del adicional (parte 1): 550.000 + 30.000 / 2 unidades.
  const linea = toManufacturingLine({
    id: "i1",
    quantity: 2,
    purchaseCost: 565000,
    notes: null,
    quoteItem: { notes: notas },
    product: { name: "Silla barbera", code: "SB-1", thumbnailUrl: "", description: null },
  });

  it("muestra la descripción y el costo, nunca el precio al cliente", () => {
    expect(linea.adicionales).toEqual([
      { descripcion: "Base cromada", costo: 30000 },
      { descripcion: "Bordado", costo: 0 },
    ]);
    expect(JSON.stringify(linea)).not.toContain("50000");
  });

  it("el subtotal no suma el adicional otra vez", () => {
    expect(linea.subtotal).toBe(1130000);
  });

  it("sin línea de cotización no hay adicionales", () => {
    expect(toManufacturingLine({ id: "i2", quantity: 1, purchaseCost: null, notes: null, product: { name: "X", code: null, thumbnailUrl: "", description: null } }).adicionales).toEqual([]);
  });
});
