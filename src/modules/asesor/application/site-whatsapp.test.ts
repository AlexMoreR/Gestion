import { describe, expect, it } from "vitest";
import { AsesorInputError } from "../domain/calculations";
import { changeSiteWhatsApp, type SiteWhatsAppDeps } from "./site-whatsapp";

function fakeDeps(start = "+57 300 000 0000") {
  const state = { phone: start, saved: [] as string[], refreshed: 0, logs: [] as string[] };
  const deps: SiteWhatsAppDeps = {
    current: async () => state.phone,
    save: async (phone) => {
      state.saved.push(phone);
      state.phone = phone;
    },
    refresh: () => {
      state.refreshed += 1;
    },
    log: async (summary) => {
      state.logs.push(summary);
    },
  };
  return { deps, state };
}

describe("changeSiteWhatsApp", () => {
  it("con confirmado=false devuelve antes y nuevo y no guarda", async () => {
    const { deps, state } = fakeDeps();
    const result = await changeSiteWhatsApp(deps, " +57 316 983 1667 ", false);
    expect(result).toMatchObject({ guardado: false, antes: "+57 300 000 0000", nuevo: "+57 316 983 1667" });
    expect(state.saved).toEqual([]);
    expect(state.refreshed).toBe(0);
    expect(state.logs).toEqual([]);
  });

  it("con confirmado=true guarda, refresca y anota en la bitácora", async () => {
    const { deps, state } = fakeDeps();
    const result = await changeSiteWhatsApp(deps, "+57 316 983 1667", true);
    expect(result.guardado).toBe(true);
    expect(state.saved).toEqual(["+57 316 983 1667"]);
    expect(state.refreshed).toBe(1);
    expect(state.logs).toEqual(["Cambió el WhatsApp de la página de +57 300 000 0000 a +57 316 983 1667 (por Claude)"]);
  });

  it.each(["", "abc", "12345", "+57 316 983 1667 ext 2", "1234567890123456"])(
    "número inválido %j → error y no escribe nada, aunque venga confirmado",
    async (numero) => {
      const { deps, state } = fakeDeps();
      await expect(changeSiteWhatsApp(deps, numero, true)).rejects.toBeInstanceOf(AsesorInputError);
      expect(state.saved).toEqual([]);
      expect(state.logs).toEqual([]);
    },
  );
});
