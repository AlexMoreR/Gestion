import { describe, expect, it } from "vitest";
import {
  CIERRE_TOPE_AJUSTE,
  CierreInputError,
  cerrarMes,
  esUltimoDiaDelMes,
  notaCierre,
  periodoDelMes,
  type CierreDeps,
  type CuentaParaCierre,
} from "./close-month";

const AHORA = new Date("2026-11-30T23:00:00Z"); // 30-nov, 6 p. m. en Colombia

const CUENTAS: CuentaParaCierre[] = [
  { id: "c1", name: "Bancolombia", type: "BANK", balance: 1_000_000 },
  { id: "c2", name: "Efectivo", type: "CASH", balance: 200_000 },
];

function fakeDeps(cerradas: string[] = []) {
  const creados: Parameters<CierreDeps["crearAjuste"]>[0][] = [];
  const bitacora: string[] = [];
  const deps: CierreDeps = {
    listarCuentas: async () => CUENTAS,
    cuentasCerradas: async () => new Set(cerradas),
    crearAjuste: async (input) => {
      if (cerradas.includes(input.accountId)) return false;
      creados.push(input);
      cerradas.push(input.accountId);
      return true;
    },
    bitacora: async (_mes, summary) => {
      bitacora.push(summary);
    },
  };
  return { deps, creados, bitacora };
}

const cerrar = (deps: CierreDeps, dictados: { cuenta: string; saldo: number }[], extra: Partial<{ confirmado: boolean; aceptoAjusteGrande: boolean }> = {}) =>
  cerrarMes(deps, { mes: "2026-11", dictados, confirmado: true, aceptoAjusteGrande: false, ...extra }, AHORA);

describe("cierre de mes", () => {
  it("si cuadra no crea movimientos", async () => {
    const { deps, creados } = fakeDeps();
    const result = await cerrar(deps, [{ cuenta: "Bancolombia", saldo: 1_000_000 }, { cuenta: "efectivo", saldo: 200_000 }]);
    expect(result.resumen).toBe("Cuadró.");
    expect(creados).toHaveLength(0);
  });

  it("si en Gestion falta plata crea un ingreso (IN) el ultimo dia del mes con la nota", async () => {
    const { deps, creados, bitacora } = fakeDeps();
    const result = await cerrar(deps, [{ cuenta: "Bancolombia", saldo: 1_020_000 }]);
    expect(result.resumen).toBe("En Bancolombia faltaban 20.000 pesos, ya quedó ajustado.");
    expect(creados).toEqual([
      { accountId: "c1", type: "IN", amount: 20_000, note: notaCierre("2026-11"), movementDate: new Date("2026-11-30T12:00:00Z") },
    ]);
    expect(bitacora).toHaveLength(1);
  });

  it("si en Gestion sobra plata crea una salida (OUT)", async () => {
    const { deps, creados } = fakeDeps();
    const result = await cerrar(deps, [{ cuenta: "efectivo", saldo: 150_000 }]);
    expect(result.resumen).toBe("En Efectivo sobraban 50.000 pesos, ya quedó ajustado.");
    expect(creados[0]).toMatchObject({ accountId: "c2", type: "OUT", amount: 50_000 });
  });

  it("sin confirmar no guarda nada", async () => {
    const { deps, creados } = fakeDeps();
    const result = await cerrar(deps, [{ cuenta: "efectivo", saldo: 150_000 }], { confirmado: false });
    expect(result.guardado).toBe(false);
    expect(creados).toHaveLength(0);
  });

  it("un segundo cierre del mismo mes no duplica el ajuste", async () => {
    const { deps, creados } = fakeDeps(["c1"]);
    const result = await cerrar(deps, [{ cuenta: "Bancolombia", saldo: 900_000 }]);
    expect(creados).toHaveLength(0);
    expect(result.resumen).toContain("ya estaba cerrada");
  });

  it("rechaza una cuenta inexistente o inactiva y una cuenta repetida", async () => {
    const { deps, creados } = fakeDeps();
    await expect(cerrar(deps, [{ cuenta: "Davivienda", saldo: 1 }])).rejects.toThrow(CierreInputError);
    await expect(
      cerrar(deps, [{ cuenta: "efectivo", saldo: 1 }, { cuenta: "Efectivo", saldo: 2 }]),
    ).rejects.toThrow(/dos veces/);
    expect(creados).toHaveLength(0);
  });

  it("un ajuste mayor al tope pide confirmarlo aparte", async () => {
    const { deps, creados } = fakeDeps();
    const dictado = [{ cuenta: "Bancolombia", saldo: 1_000_000 + CIERRE_TOPE_AJUSTE + 1 }];
    const sinAceptar = await cerrar(deps, dictado);
    expect(sinAceptar.guardado).toBe(false);
    expect(sinAceptar.grandes).toHaveLength(1);
    expect(creados).toHaveLength(0);
    const aceptado = await cerrar(deps, dictado, { aceptoAjusteGrande: true });
    expect(aceptado.guardado).toBe(true);
    expect(creados).toHaveLength(1);
  });

  it("no cierra un mes que no ha empezado y valida el formato", () => {
    expect(() => periodoDelMes("2026-12", AHORA)).toThrow(CierreInputError);
    expect(() => periodoDelMes("2026-13", AHORA)).toThrow(CierreInputError);
    expect(periodoDelMes("2026-10", AHORA).period.to).toEqual(new Date("2026-11-01T00:00:00Z"));
  });

  it("ultimo dia del mes en hora de Colombia", () => {
    expect(esUltimoDiaDelMes(new Date("2026-11-30T23:00:00Z"))).toBe(true);
    expect(esUltimoDiaDelMes(new Date("2026-12-01T06:00:00Z"))).toBe(false);
    expect(esUltimoDiaDelMes(new Date("2026-11-30T04:00:00Z"))).toBe(false); // aun 29-nov en Colombia
  });
});
