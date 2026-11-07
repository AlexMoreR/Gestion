import { describe, expect, it } from "vitest";
import {
  confirmationKey,
  dispatchBlocker,
  dispatchGaps,
  dispatchResultMessage,
  dispatchToDeliver,
  isOrderDeliveryDone,
  isOrderFullyDispatched,
  missingDispatchItems,
  pendingItemsLabel,
  splitDispatchSelection,
} from "./order-dispatch";

const item = (id: string, name: string, ready: boolean, dispatched = false) => ({ id, name, ready, dispatched });

describe("splitDispatchSelection", () => {
  it("colectivo de 3 recogidos: entran los 3 y nadie queda fuera", () => {
    const items = [item("a", "Carrito", true), item("b", "Escalera", true), item("c", "Diván", true)];
    const { toDispatch, leftOut } = splitDispatchSelection(items, ["a", "b", "c"]);
    expect(toDispatch.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(leftOut).toEqual([]);
  });

  it("mezcla (caso ORD-96): 1 recogido sale, los 3 fabricando quedan fuera con su nombre", () => {
    const items = [
      item("a", "Carrito auxiliar", true),
      item("b", "Escalera", false),
      item("c", "Diván", false),
      item("d", "Neut corazón alta", false),
    ];
    const { toDispatch, leftOut } = splitDispatchSelection(items, ["a", "b", "c", "d"]);
    expect(toDispatch.map((i) => i.name)).toEqual(["Carrito auxiliar"]);
    expect(leftOut.map((i) => i.name)).toEqual(["Escalera", "Diván", "Neut corazón alta"]);
  });

  it("individual: solo el elegido, sin tocar los demás recogidos", () => {
    const items = [item("a", "Carrito", true), item("b", "Escalera", true)];
    const { toDispatch, leftOut } = splitDispatchSelection(items, ["b"]);
    expect(toDispatch.map((i) => i.id)).toEqual(["b"]);
    expect(leftOut).toEqual([]);
  });

  it("lo ya despachado no vuelve a salir", () => {
    const items = [item("a", "Carrito", true, true), item("b", "Escalera", true)];
    expect(splitDispatchSelection(items, ["a", "b"]).toDispatch.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("estado de la orden", () => {
  const four = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("1 despachado de 4: faltan 3 y la orden no pasa a Despachada", () => {
    expect(missingDispatchItems(four, ["a"]).map((i) => i.id)).toEqual(["b", "c", "d"]);
    expect(isOrderFullyDispatched(four, ["a"])).toBe(false);
  });

  it("los 4 despachados (en varios despachos): pasa a Despachada", () => {
    expect(isOrderFullyDispatched(four, ["a", "b", "c", "d", "a"])).toBe(true);
  });

  it("orden de un solo producto: despacharlo la deja lista para Despachada", () => {
    expect(isOrderFullyDispatched([{ id: "x" }], [])).toBe(false);
    expect(isOrderFullyDispatched([{ id: "x" }], ["x"])).toBe(true);
  });

  it("una orden sin productos nunca queda Despachada por esta regla", () => {
    expect(isOrderFullyDispatched([], [])).toBe(false);
  });
});

describe("dispatchResultMessage", () => {
  it("dice cuántos salieron y cuáles faltan", () => {
    expect(dispatchResultMessage(3, ["Escalera", "Diván"])).toBe(
      "Despachados 3 productos · Faltan por despachar: Escalera, Diván",
    );
  });
  it("singular correcto y sin faltantes", () => {
    expect(dispatchResultMessage(1, [])).toBe("Despachado 1 producto");
  });
});

describe("entrega con varios despachos", () => {
  const d = (id: string, status: string, day: number, itemCount = 1) => ({
    id,
    status,
    createdAt: new Date(Date.UTC(2026, 10, day)),
    itemCount,
  });

  it("Registrar entrega toma el primer despacho sin entregar", () => {
    expect(dispatchToDeliver([d("nuevo", "DELIVERED", 5), d("viejo", "PACKING", 2)])).toBe("viejo");
  });

  it("todo entregado: apunta al último (para deshacer)", () => {
    expect(dispatchToDeliver([d("a", "DELIVERED", 2), d("b", "DELIVERED", 5), d("c", "CANCELLED", 6)])).toBe("b");
  });

  it("sin despachos activos: nada", () => {
    expect(dispatchToDeliver([d("c", "CANCELLED", 6)])).toBeNull();
  });

  it("el último entregado no basta si otro sigue sin entregar", () => {
    expect(
      isOrderDeliveryDone({ allItemsDispatched: true, dispatches: [d("a", "PACKING", 2), d("b", "DELIVERED", 5)] }),
    ).toBe(false);
  });

  it("entregado solo con todo despachado y entregado", () => {
    const dispatches = [d("a", "DELIVERED", 2), d("b", "DELIVERED", 5)];
    expect(isOrderDeliveryDone({ allItemsDispatched: false, dispatches })).toBe(false);
    expect(isOrderDeliveryDone({ allItemsDispatched: true, dispatches })).toBe(true);
  });

  it("despachos viejos sin productos ligados: como antes, el último entregado", () => {
    expect(isOrderDeliveryDone({ allItemsDispatched: false, dispatches: [d("a", "DELIVERED", 2, 0)] })).toBe(true);
  });
});

describe("pendingItemsLabel", () => {
  it("muestra todo lo pendiente", () => {
    expect(pendingItemsLabel({ fabricar: 0, recoger: 3, despachar: 1 })).toBe("Pendiente recoger 3 · despachar 1");
  });
  it("una sola etapa conserva el texto de siempre", () => {
    expect(pendingItemsLabel({ fabricar: 0, recoger: 3, despachar: 0 })).toBe("Pendiente recoger 3 productos");
    expect(pendingItemsLabel({ fabricar: 1, recoger: 0, despachar: 0 })).toBe("Pendiente fabricar 1 producto");
  });
  it("nada pendiente", () => {
    expect(pendingItemsLabel({ fabricar: 0, recoger: 0, despachar: 0 })).toBe("Despachado");
  });
});

describe("dispatchBlocker", () => {
  const base = {
    fulfillmentMode: "MANUFACTURE",
    confirmedAt: new Date(),
    confirmedSupplierId: "s1",
    hasPurchaseCost: true,
    photoCount: 1,
    supplierPaymentStatus: "PENDING",
  };
  it("recogido: listo", () => {
    expect(dispatchBlocker(base, false)).toBeNull();
  });
  it("fabricando: dice por qué no sale", () => {
    expect(dispatchBlocker({ ...base, photoCount: 0, supplierPaymentStatus: null }, false)).toMatch(/sin recoger/);
    expect(dispatchBlocker({ ...base, confirmedSupplierId: null }, false)).toMatch(/proveedor/);
  });
  it("stock sin confirmar no sale; en una compra todo sale", () => {
    expect(dispatchBlocker({ ...base, fulfillmentMode: "STOCK", confirmedAt: null }, false)).toMatch(/stock/);
    expect(dispatchBlocker({ ...base, photoCount: 0 }, true)).toBeNull();
  });
});

describe("dispatchGaps (revisión de órdenes afectadas)", () => {
  const items = [
    { id: "a", ready: true },
    { id: "b", ready: true },
    { id: "c", ready: false },
  ];
  it("despachada con productos sin despacho y un recogido que debió salir", () => {
    const r = dispatchGaps({ orderStatus: "DISPATCHED", items, dispatchedItemIds: ["a"] });
    expect(r.gaps).toEqual(["despachada_incompleta", "recogido_sin_salir"]);
    expect(r.missingIds).toEqual(["b", "c"]);
    expect(r.readyNotDispatchedIds).toEqual(["b"]);
  });
  it("en producción con lo recogido ya despachado: nada", () => {
    expect(
      dispatchGaps({ orderStatus: "IN_PRODUCTION", items, dispatchedItemIds: ["a", "b"] }).gaps,
    ).toEqual([]);
  });
  it("sin despachos ligados (orden vieja) o cancelada: no se juzga", () => {
    expect(dispatchGaps({ orderStatus: "DISPATCHED", items, dispatchedItemIds: [] }).gaps).toEqual([]);
    expect(dispatchGaps({ orderStatus: "CANCELLED", items, dispatchedItemIds: ["a"] }).gaps).toEqual([]);
  });
});

describe("confirmationKey", () => {
  const row = (id: string, isConfirmed: boolean, isRecogido = false, isDespachado = false) => ({
    id,
    isConfirmed,
    isRecogido,
    isDespachado,
  });

  it("cambia cuando un producto pasa a confirmado (Fabricar → Confirmar compra)", () => {
    const antes = [row("a", false), row("b", false)];
    const despues = [row("a", true), row("b", false)];
    expect(confirmationKey(despues)).not.toBe(confirmationKey(antes));
  });

  it("cambia cuando varios se confirman a la vez o uno vuelve a sin confirmar", () => {
    const antes = [row("a", false), row("b", false), row("c", true)];
    expect(confirmationKey([row("a", true), row("b", true), row("c", true)])).not.toBe(confirmationKey(antes));
    expect(confirmationKey([row("a", false), row("b", false), row("c", false)])).not.toBe(confirmationKey(antes));
  });

  it("no cambia si solo pasa a recogido o despachado (el cuadro de Recoger no se cierra solo)", () => {
    const antes = [row("a", true), row("b", true)];
    const despues = [row("a", true, true), row("b", true, true, true)];
    expect(confirmationKey(despues)).toBe(confirmationKey(antes));
  });
});
