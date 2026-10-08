import { describe, expect, it } from "vitest";

import {
  buildShipmentCode,
  generateUniqueShipmentCode,
  isLegacyShipmentCode,
  normalizeShipmentCodeInput,
  resolveShipmentByCode,
} from "./codes";
import { addBusinessDays, businessDaysFor, destinationTier, estimateDelivery, parseDateInput } from "./eta";
import {
  abbreviateName,
  evaluateLookupLimit,
  maskPhone,
  MAX_FAILURES_PER_CODE,
  MAX_FAILURES_PER_IP,
  parseLast4Input,
  phoneLast4,
  safeEqual,
} from "./lookup";
import { canCarrierMoveTo, canMagilusMoveTo, dispatchStatusForShipment, flowProgress } from "./statuses";

const NEW_CODE = /^MG-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

describe("codigo MG", () => {
  it("genera un codigo aleatorio con el formato nuevo", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(buildShipmentCode()).toMatch(NEW_CODE);
    }
  });

  it("nunca usa caracteres confusos (O, I, L, 0, 1)", () => {
    for (let i = 0; i < 200; i += 1) {
      // Se ignora el prefijo "MG-" (fijo) y se revisa el cuerpo aleatorio.
      const body = buildShipmentCode().slice(3);
      expect(body).not.toMatch(/[OIL01]/);
    }
  });

  it("no repite codigos en muchas generaciones", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(buildShipmentCode());
    }
    expect(seen.size).toBe(1000);
  });

  it("reintenta cuando el codigo ya existe y entrega uno libre", async () => {
    let calls = 0;
    // Los dos primeros intentos "chocan"; el tercero esta libre.
    const exists = async () => {
      calls += 1;
      return calls <= 2;
    };
    const code = await generateUniqueShipmentCode(exists);
    expect(code).toMatch(NEW_CODE);
    expect(calls).toBe(3);
  });

  it("se rinde tras el maximo de intentos si todo choca", async () => {
    await expect(generateUniqueShipmentCode(async () => true, 5)).rejects.toThrow();
  });

  it("acepta el formato NUEVO que escribe el cliente", () => {
    expect(normalizeShipmentCodeInput("MG-7K4Q2P8")).toBe("MG-7K4Q2P8");
    expect(normalizeShipmentCodeInput("mg-7k4q2p8")).toBe("MG-7K4Q2P8");
    expect(normalizeShipmentCodeInput("MG7K4Q2P8")).toBe("MG-7K4Q2P8");
    expect(normalizeShipmentCodeInput("7K4Q2P8")).toBe("MG-7K4Q2P8");
    expect(normalizeShipmentCodeInput(" mg 7k4q2p8 ")).toBe("MG-7K4Q2P8");
    expect(normalizeShipmentCodeInput("ABCDEFGH")).toBe("MG-ABCDEFGH");
    // Cuerpo (8) que empieza por "MG" sin prefijo escrito: no se recorta, es el cuerpo completo.
    expect(normalizeShipmentCodeInput("MGK4Q2PA")).toBe("MG-MGK4Q2PA");
  });

  it("sigue aceptando el formato VIEJO de las guias ya guardadas", () => {
    expect(normalizeShipmentCodeInput("MG-000001")).toBe("MG-000001");
    expect(normalizeShipmentCodeInput("MG-000123")).toBe("MG-000123");
    expect(normalizeShipmentCodeInput("mg123")).toBe("MG-000123");
    expect(normalizeShipmentCodeInput(" MG 123 ")).toBe("MG-000123");
    expect(normalizeShipmentCodeInput("123")).toBe("MG-000123");
    expect(normalizeShipmentCodeInput("000123")).toBe("MG-000123");
  });

  it("rechaza lo que no es un numero de guia", () => {
    expect(normalizeShipmentCodeInput("")).toBeNull();
    expect(normalizeShipmentCodeInput("0")).toBeNull();
    expect(normalizeShipmentCodeInput("DSP-00001")).toBeNull();
    expect(normalizeShipmentCodeInput("MG-12a")).toBeNull();
  });

  it("distingue el formato viejo del nuevo", () => {
    expect(isLegacyShipmentCode("MG-000001")).toBe(true);
    expect(isLegacyShipmentCode("MG-1234567")).toBe(true);
    expect(isLegacyShipmentCode("MG-7K4Q2P8X")).toBe(false);
    expect(isLegacyShipmentCode("MG-ABCDEFGH")).toBe(false);
  });
});

describe("busqueda de la guia por codigo viejo o nuevo", () => {
  type Row = { id: string; code: string; legacyCode: string | null };
  // Repo falso: una guia vieja ya recodificada y una nueva.
  const rows: Row[] = [
    { id: "vieja", code: "MG-7K4Q2P8X", legacyCode: "MG-000001" },
    { id: "nueva", code: "MG-ABCDEFGH", legacyCode: null },
  ];
  function fakeRepo() {
    const calls = { byCode: [] as string[], byLegacyCode: [] as string[] };
    return {
      calls,
      finders: {
        byCode: async (code: string) => {
          calls.byCode.push(code);
          return rows.find((row) => row.code === code) ?? null;
        },
        byLegacyCode: async (legacyCode: string) => {
          calls.byLegacyCode.push(legacyCode);
          return rows.find((row) => row.legacyCode === legacyCode) ?? null;
        },
      },
    };
  }
  async function find(input: string) {
    const code = normalizeShipmentCodeInput(input);
    if (!code) return null;
    return resolveShipmentByCode(code, fakeRepo().finders);
  }

  it("el codigo viejo encuentra la guia via legacyCode y devuelve el codigo nuevo", async () => {
    const repo = fakeRepo();
    const found = await resolveShipmentByCode("MG-000001", repo.finders);
    expect(found?.id).toBe("vieja");
    expect(found?.code).toBe("MG-7K4Q2P8X");
    expect(repo.calls.byLegacyCode).toEqual(["MG-000001"]);
  });

  it("acepta el codigo viejo escrito de cualquier forma", async () => {
    for (const input of ["MG-000001", "mg-000001", "mg1", "1", "000001", " MG 000001 "]) {
      expect((await find(input))?.code).toBe("MG-7K4Q2P8X");
    }
  });

  it("el codigo nuevo de la guia recodificada tambien la encuentra", async () => {
    expect((await find("mg-7k4q2p8x"))?.id).toBe("vieja");
    expect((await find("MG-ABCDEFGH"))?.id).toBe("nueva");
  });

  it("un codigo nuevo que no existe no se busca en legacyCode", async () => {
    const repo = fakeRepo();
    expect(await resolveShipmentByCode("MG-ZZZZZZZZ", repo.finders)).toBeNull();
    expect(repo.calls.byLegacyCode).toEqual([]);
  });

  it("un codigo viejo inexistente devuelve null", async () => {
    expect(await find("MG-000999")).toBeNull();
  });

  it("antes de la migracion (code aun viejo) el codigo viejo sigue encontrando la guia", async () => {
    const before = { id: "x", code: "MG-000005", legacyCode: null };
    const found = await resolveShipmentByCode("MG-000005", {
      byCode: async (code) => (code === before.code ? before : null),
      byLegacyCode: async () => null,
    });
    expect(found?.id).toBe("x");
  });
});

describe("fecha estimada", () => {
  it("clasifica el destino", () => {
    expect(destinationTier("11001")).toBe("BOGOTA");
    expect(destinationTier("76001")).toBe("CAPITAL");
    expect(destinationTier("76111")).toBe("MUNICIPIO");
    expect(destinationTier(null)).toBe("MUNICIPIO");
    expect(businessDaysFor("11001")).toBe(3);
    expect(businessDaysFor("05001")).toBe(5);
    expect(businessDaysFor("25843")).toBe(7);
  });

  it("suma dias habiles saltando sabado y domingo", () => {
    // Miercoles 7-oct-2026 10:00 hora Colombia (15:00 UTC).
    const wednesday = new Date("2026-10-07T15:00:00Z");
    expect(addBusinessDays(wednesday, 3).toISOString().slice(0, 10)).toBe("2026-10-12"); // lunes
    expect(addBusinessDays(wednesday, 5).toISOString().slice(0, 10)).toBe("2026-10-14");
    expect(addBusinessDays(wednesday, 7).toISOString().slice(0, 10)).toBe("2026-10-16");
    // Viernes + 1 habil = lunes
    expect(addBusinessDays(new Date("2026-10-09T15:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-10-12");
  });

  it("usa el dia de Colombia, no el de UTC", () => {
    // 8-oct 03:00 UTC = 7-oct 22:00 en Colombia (miercoles).
    const lateNight = new Date("2026-10-08T03:00:00Z");
    expect(estimateDelivery(lateNight, "11001").toISOString().slice(0, 10)).toBe("2026-10-12");
  });

  it("lee la fecha del formulario", () => {
    expect(parseDateInput("2026-10-15")?.toISOString()).toBe("2026-10-15T12:00:00.000Z");
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("15/10/2026")).toBeNull();
  });
});

describe("ultimos 4 del celular", () => {
  it("toma los ultimos 4 digitos del celular guardado", () => {
    expect(phoneLast4("+57 300 123 4567")).toBe("4567");
    expect(phoneLast4("3001234567")).toBe("4567");
    expect(phoneLast4("123")).toBeNull();
    expect(phoneLast4(null)).toBeNull();
  });

  it("valida lo que escribe el cliente", () => {
    expect(parseLast4Input("4567")).toBe("4567");
    expect(parseLast4Input(" 45 67 ")).toBe("4567");
    expect(parseLast4Input("456")).toBeNull();
    expect(parseLast4Input("45678")).toBeNull();
    expect(parseLast4Input("45a7")).toBeNull();
  });

  it("compara en tiempo constante", () => {
    expect(safeEqual("4567", "4567")).toBe(true);
    expect(safeEqual("4567", "4568")).toBe(false);
    expect(safeEqual("4567", "456")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("enmascara el celular y abrevia nombres", () => {
    expect(maskPhone("3001234567")).toBe("*** *** 4567");
    expect(maskPhone("")).toBe("Sin celular");
    expect(abbreviateName("Ana Maria Lopez")).toBe("Ana L.");
    expect(abbreviateName("Ana")).toBe("Ana");
    expect(abbreviateName("  ")).toBe("");
  });
});

describe("limite de intentos", () => {
  it("permite por debajo de los topes", () => {
    expect(evaluateLookupLimit({ ipFailures: 0, codeFailures: 0 })).toEqual({ allowed: true });
    expect(
      evaluateLookupLimit({ ipFailures: MAX_FAILURES_PER_IP - 1, codeFailures: MAX_FAILURES_PER_CODE - 1 }),
    ).toEqual({ allowed: true });
  });

  it("bloquea por IP a los 10 fallos y por guia a los 5", () => {
    expect(evaluateLookupLimit({ ipFailures: 10, codeFailures: 0 })).toEqual({ allowed: false, reason: "IP" });
    expect(evaluateLookupLimit({ ipFailures: 0, codeFailures: 5 })).toEqual({ allowed: false, reason: "CODE" });
  });
});

describe("etapas", () => {
  it("el transportador solo avanza", () => {
    expect(canCarrierMoveTo("CREATED", "PICKED_UP").ok).toBe(true);
    expect(canCarrierMoveTo("CREATED", "DELIVERED").ok).toBe(true);
    expect(canCarrierMoveTo("IN_TRANSIT", "PICKED_UP").ok).toBe(false);
    expect(canCarrierMoveTo("DELIVERED", "DELIVERED").ok).toBe(false);
    expect(canCarrierMoveTo("CREATED", "CANCELLED").ok).toBe(false);
  });

  it("Magilus retrocede solo con nota", () => {
    expect(canMagilusMoveTo("IN_TRANSIT", "PICKED_UP", "").ok).toBe(false);
    expect(canMagilusMoveTo("IN_TRANSIT", "PICKED_UP", "error del conductor").ok).toBe(true);
    expect(canMagilusMoveTo("DELIVERED", "IN_TRANSIT", "").ok).toBe(false);
    expect(canMagilusMoveTo("CREATED", "IN_TRANSIT", "").ok).toBe(true);
    expect(canMagilusMoveTo("CREATED", "CREATED", "x").ok).toBe(false);
  });

  it("sincroniza el despacho sin retrocederlo", () => {
    expect(dispatchStatusForShipment("PICKED_UP", "PACKING")).toBe("SHIPPED");
    expect(dispatchStatusForShipment("IN_TRANSIT", "SHIPPED")).toBeNull();
    expect(dispatchStatusForShipment("DELIVERED", "SHIPPED")).toBe("DELIVERED");
    expect(dispatchStatusForShipment("DELIVERED", "DELIVERED")).toBeNull();
    expect(dispatchStatusForShipment("RETURNED", "SHIPPED")).toBe("RETURNED");
    expect(dispatchStatusForShipment("CREATED", "PACKING")).toBeNull();
    expect(dispatchStatusForShipment("IN_TRANSIT", "CANCELLED")).toBeNull();
  });

  it("calcula el progreso", () => {
    expect(flowProgress("CREATED")).toBe(0);
    expect(flowProgress("DELIVERED")).toBe(1);
    expect(flowProgress("CANCELLED")).toBe(0);
  });
});
