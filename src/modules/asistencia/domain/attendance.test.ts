import { describe, expect, it } from "vitest";
import {
  activeMarks,
  attendanceDrivesPayroll,
  bogotaDay,
  bogotaInstant,
  bogotaTime,
  formatMinutes,
  isMonthKey,
  monthDays,
  nextMark,
  summarizeDay,
  validReason,
  workedDays,
  workedDaysByUser,
  type AttendanceMark,
} from "./attendance";

// Hora Colombia -> instante (UTC-5).
function at(day: string, time: string): Date {
  return new Date(`${day}T${time}:00-05:00`);
}

let seq = 0;
function mark(overrides: Partial<AttendanceMark> & Pick<AttendanceMark, "kind" | "markedAt">): AttendanceMark {
  seq += 1;
  return {
    id: `m${seq}`,
    userId: "emanuel",
    day: bogotaDay(overrides.markedAt),
    origin: "PROPIA",
    createdById: "emanuel",
    createdByName: "Emanuel",
    reason: null,
    correctsId: null,
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    createdAt: overrides.markedAt,
    ...overrides,
  };
}

describe("bogotaDay y bogotaTime", () => {
  it("el dia en Colombia cambia a las 05:00 UTC (medianoche en Colombia)", () => {
    expect(bogotaDay(new Date("2026-11-03T04:59:00Z"))).toBe("2026-11-02");
    expect(bogotaDay(new Date("2026-11-03T05:00:00Z"))).toBe("2026-11-03");
  });
  it("hora HH:MM en Colombia", () => {
    expect(bogotaTime(new Date("2026-11-03T04:59:00Z"))).toBe("23:59");
    expect(bogotaTime(new Date("2026-11-03T13:05:00Z"))).toBe("08:05");
  });
});

describe("bogotaInstant", () => {
  it("convierte dia y hora de Colombia a instante", () => {
    expect(bogotaInstant("2026-11-02", "08:30")?.toISOString()).toBe("2026-11-02T13:30:00.000Z");
    expect(bogotaInstant("2026-11-02", "23:59")?.toISOString()).toBe("2026-11-03T04:59:00.000Z");
  });
  it("rechaza fechas u horas invalidas", () => {
    expect(bogotaInstant("2026-02-30", "08:00")).toBeNull();
    expect(bogotaInstant("2026-11-02", "24:00")).toBeNull();
    expect(bogotaInstant("2026-11-02", "8:00")).toBeNull();
    expect(bogotaInstant("02/11/2026", "08:00")).toBeNull();
  });
});

describe("activeMarks", () => {
  it("quita anuladas y ordena por hora", () => {
    const late = mark({ kind: "SALIDA", markedAt: at("2026-11-02", "17:00") });
    const early = mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "08:00") });
    const voided = mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "09:00"), voidedAt: new Date() });
    expect(activeMarks([late, voided, early]).map((item) => item.id)).toEqual([early.id, late.id]);
  });
});

describe("nextMark", () => {
  const now = at("2026-11-02", "10:00");

  it("sin marcas toca ENTRADA hoy", () => {
    expect(nextMark([], now)).toEqual({ kind: "ENTRADA", day: "2026-11-02", openSince: null });
  });

  it("tras una ENTRADA toca SALIDA con el dia de la entrada", () => {
    const entry = mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "08:00") });
    expect(nextMark([entry], now)).toEqual({ kind: "SALIDA", day: "2026-11-02", openSince: entry.markedAt });
  });

  it("tras ENTRADA y SALIDA vuelve a tocar ENTRADA", () => {
    const marks = [
      mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "08:00") }),
      mark({ kind: "SALIDA", markedAt: at("2026-11-02", "09:00") }),
    ];
    expect(nextMark(marks, now).kind).toBe("ENTRADA");
  });

  it("turno de madrugada: entrada anoche 22:00 y ahora 02:00 -> SALIDA del dia anterior", () => {
    const entry = mark({ kind: "ENTRADA", markedAt: at("2026-11-01", "22:00") });
    expect(nextMark([entry], at("2026-11-02", "02:00"))).toEqual({ kind: "SALIDA", day: "2026-11-01", openSince: entry.markedAt });
  });

  it("salida olvidada de una entrada de la tarde (17:00): al otro dia a las 08:00 toca ENTRADA", () => {
    const entry = mark({ kind: "ENTRADA", markedAt: at("2026-11-01", "17:00") });
    expect(nextMark([entry], at("2026-11-02", "08:00"))).toEqual({ kind: "ENTRADA", day: "2026-11-02", openSince: null });
  });

  it("entrada de noche con mas de 12 h abierta: toca ENTRADA hoy", () => {
    const entry = mark({ kind: "ENTRADA", markedAt: at("2026-11-01", "19:00") });
    expect(nextMark([entry], at("2026-11-02", "08:00")).kind).toBe("ENTRADA");
  });

  it("entrada vieja de mas de 16 h (salida olvidada) -> ENTRADA hoy", () => {
    const entry = mark({ kind: "ENTRADA", markedAt: at("2026-11-01", "08:00") });
    expect(nextMark([entry], at("2026-11-02", "08:00"))).toEqual({ kind: "ENTRADA", day: "2026-11-02", openSince: null });
  });

  it("ignora las marcas anuladas", () => {
    const voidedEntry = mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "08:00"), voidedAt: new Date() });
    expect(nextMark([voidedEntry], now).kind).toBe("ENTRADA");
    const entry = mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "08:00") });
    const voidedExit = mark({ kind: "SALIDA", markedAt: at("2026-11-02", "09:00"), voidedAt: new Date() });
    expect(nextMark([entry, voidedExit], now).kind).toBe("SALIDA");
  });
});

describe("summarizeDay", () => {
  const day = "2026-11-02";

  it("sin marcas: no ha llegado", () => {
    const summary = summarizeDay(day, [], at(day, "10:00"));
    expect(summary).toMatchObject({ status: "NO_HA_LLEGADO", worked: false, minutes: 0, openEntry: false, missingExit: false });
  });

  it("con entrada abierta hoy: trabajando, sin minutos inventados", () => {
    const summary = summarizeDay(day, [mark({ kind: "ENTRADA", markedAt: at(day, "08:00") })], at(day, "10:00"));
    expect(summary).toMatchObject({ status: "TRABAJANDO", worked: true, minutes: 0, openEntry: true, missingExit: false, lastExit: null });
  });

  it("entrada y salida: salio, minutos del par", () => {
    const summary = summarizeDay(
      day,
      [mark({ kind: "ENTRADA", markedAt: at(day, "08:00") }), mark({ kind: "SALIDA", markedAt: at(day, "17:30") })],
      at(day, "18:00"),
    );
    expect(summary).toMatchObject({ status: "SALIO", minutes: 570, openEntry: false });
    expect(summary.firstEntry).toEqual(at(day, "08:00"));
    expect(summary.lastExit).toEqual(at(day, "17:30"));
  });

  it("varias entradas y salidas (almuerzo) suman solo los pares", () => {
    const marks = [
      mark({ kind: "ENTRADA", markedAt: at(day, "08:00") }),
      mark({ kind: "SALIDA", markedAt: at(day, "12:00") }),
      mark({ kind: "ENTRADA", markedAt: at(day, "13:00") }),
      mark({ kind: "SALIDA", markedAt: at(day, "17:15") }),
    ];
    const summary = summarizeDay(day, marks, at(day, "18:00"));
    expect(summary.minutes).toBe(4 * 60 + 4 * 60 + 15);
    expect(summary.status).toBe("SALIO");
    expect(summary.firstEntry).toEqual(at(day, "08:00"));
  });

  it("de vuelta del almuerzo: trabajando y cuenta solo la manana", () => {
    const marks = [
      mark({ kind: "ENTRADA", markedAt: at(day, "08:00") }),
      mark({ kind: "SALIDA", markedAt: at(day, "12:00") }),
      mark({ kind: "ENTRADA", markedAt: at(day, "13:00") }),
    ];
    const summary = summarizeDay(day, marks, at(day, "15:00"));
    expect(summary).toMatchObject({ status: "TRABAJANDO", minutes: 240, lastExit: null });
  });

  it("salida olvidada en un dia pasado: cuenta el dia, missingExit y 0 minutos", () => {
    const summary = summarizeDay(day, [mark({ kind: "ENTRADA", markedAt: at(day, "08:00") })], at("2026-11-04", "10:00"));
    expect(summary).toMatchObject({ status: "SALIO", worked: true, minutes: 0, openEntry: true, missingExit: true, lastExit: null });
  });

  it("dos entradas seguidas: vale la primera, no se inventan horas", () => {
    const marks = [
      mark({ kind: "ENTRADA", markedAt: at(day, "08:00") }),
      mark({ kind: "ENTRADA", markedAt: at(day, "09:00") }),
      mark({ kind: "SALIDA", markedAt: at(day, "10:00") }),
      mark({ kind: "SALIDA", markedAt: at(day, "11:00") }),
    ];
    expect(summarizeDay(day, marks, at(day, "12:00")).minutes).toBe(120);
  });

  it("turno que pasa de medianoche cuenta en el dia de la entrada", () => {
    const marks = [
      mark({ kind: "ENTRADA", markedAt: at(day, "22:00") }),
      mark({ kind: "SALIDA", markedAt: at("2026-11-03", "02:00"), day }),
    ];
    expect(summarizeDay(day, marks, at("2026-11-03", "03:00"))).toMatchObject({ status: "SALIO", minutes: 240 });
  });

  it("ignora marcas de otros dias", () => {
    const summary = summarizeDay(day, [mark({ kind: "ENTRADA", markedAt: at("2026-11-01", "08:00") })], at(day, "10:00"));
    expect(summary).toMatchObject({ status: "NO_HA_LLEGADO", worked: false, marks: [] });
  });

  it("corrected y reasons con correcciones y anuladas", () => {
    const original = mark({
      kind: "ENTRADA",
      markedAt: at(day, "09:00"),
      voidedAt: at(day, "12:00"),
      voidedById: "alex",
      voidReason: "Llego a las 8, marco tarde",
    });
    const fix = mark({
      kind: "ENTRADA",
      markedAt: at(day, "08:00"),
      origin: "CORRECCION",
      createdById: "alex",
      reason: "Llego a las 8, marco tarde",
      correctsId: original.id,
    });
    const exit = mark({ kind: "SALIDA", markedAt: at(day, "12:00"), origin: "CORRECCION", reason: "Olvido la salida" });
    const summary = summarizeDay(day, [original, fix, exit], at(day, "13:00"));
    expect(summary.corrected).toBe(true);
    expect(summary.reasons).toEqual(["Llego a las 8, marco tarde", "Olvido la salida"]);
    expect(summary.minutes).toBe(240);
    expect(summary.marks).toHaveLength(3);
  });

  it("sin correcciones: corrected false y sin motivos", () => {
    const summary = summarizeDay(day, [mark({ kind: "ENTRADA", markedAt: at(day, "08:00") })], at(day, "09:00"));
    expect(summary).toMatchObject({ corrected: false, reasons: [] });
  });
});

describe("workedDays y workedDaysByUser", () => {
  const marks = [
    mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "08:00") }),
    mark({ kind: "SALIDA", markedAt: at("2026-11-02", "12:00") }),
    mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "13:00") }),
    mark({ kind: "SALIDA", markedAt: at("2026-11-02", "17:00") }),
    mark({ kind: "ENTRADA", markedAt: at("2026-11-04", "08:00"), voidedAt: new Date() }),
    mark({ kind: "SALIDA", markedAt: at("2026-11-05", "17:00") }),
    mark({ kind: "ENTRADA", markedAt: at("2026-10-31", "08:00") }),
    mark({ kind: "ENTRADA", markedAt: at("2026-11-06", "08:00") }),
    mark({ kind: "ENTRADA", markedAt: at("2026-11-02", "08:00"), userId: "ingrid" }),
  ];

  it("cuenta dias distintos con entrada vigente del mes", () => {
    const own = marks.filter((item) => item.userId === "emanuel");
    expect(workedDays(own, "2026-11")).toEqual(["2026-11-02", "2026-11-06"]);
    expect(workedDays(own, "2026-10")).toEqual(["2026-10-31"]);
  });

  it("por persona; quien no tiene dias no aparece", () => {
    expect(workedDaysByUser(marks, "2026-11")).toEqual({ emanuel: 2, ingrid: 1 });
    expect(workedDaysByUser(marks, "2026-12")).toEqual({});
  });

  it("solo SALIDA no cuenta como dia trabajado", () => {
    expect(workedDays([mark({ kind: "SALIDA", markedAt: at("2026-11-05", "17:00") })], "2026-11")).toEqual([]);
  });
});

describe("monthDays y formatMinutes", () => {
  it("lista los dias del mes hasta hoy", () => {
    expect(monthDays("2026-11", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(monthDays("2026-02", "2026-12-01")).toHaveLength(28);
    expect(monthDays("2026-12", "2026-11-30")).toEqual([]);
  });
  it("formato de minutos", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(425)).toBe("7 h 05 min");
  });
});

describe("attendanceDrivesPayroll", () => {
  it("desde noviembre de 2026", () => {
    expect(attendanceDrivesPayroll("2026-09")).toBe(false);
    expect(attendanceDrivesPayroll("2026-10")).toBe(false);
    expect(attendanceDrivesPayroll("2026-11")).toBe(true);
    expect(attendanceDrivesPayroll("2027-01")).toBe(true);
  });
});

describe("validReason", () => {
  it("exige un motivo de al menos 5 letras y lo recorta", () => {
    expect(validReason(null)).toBeNull();
    expect(validReason(undefined)).toBeNull();
    expect(validReason("   ")).toBeNull();
    expect(validReason(" abc ")).toBeNull();
    expect(validReason("  Olvido marcar  ")).toBe("Olvido marcar");
    expect(validReason("x".repeat(301))).toBeNull();
  });
});

describe("isMonthKey", () => {
  it("acepta AAAA-MM con mes 01..12", () => {
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
  });
});
