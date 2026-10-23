import { beforeEach, describe, expect, it } from "vitest";
import {
  AttendanceInputError,
  addMissingMarkUseCase,
  correctMarkUseCase,
  getMyAttendanceUseCase,
  getTodayBoardUseCase,
  getWorkedDaysByMonthUseCase,
  markForPersonUseCase,
  markOwnAttendanceUseCase,
  voidMarkUseCase,
} from "./use-cases";
import { bogotaDay, type AttendanceMark } from "../domain/attendance";
import type { AsistenciaRepository, AttendanceStaff, DecideMark, NewAttendanceMark } from "../domain/repository";

// Hora Colombia -> instante (UTC-5).
function at(day: string, time: string): Date {
  return new Date(`${day}T${time}:00-05:00`);
}

// Repositorio en memoria. `clock` es la "hora del servidor" que usa markNow.
class MemoryRepo implements AsistenciaRepository {
  marks: AttendanceMark[] = [];
  private seq = 0;
  constructor(
    public staff: AttendanceStaff[],
    public clock: { now: Date },
  ) {}

  async listStaff() {
    return this.staff;
  }

  async listMarks(filter: { fromDay: string; toDay: string; userId?: string }) {
    return this.marks
      .filter((mark) => mark.day >= filter.fromDay && mark.day <= filter.toDay)
      .filter((mark) => !filter.userId || mark.userId === filter.userId)
      .map((mark) => ({ ...mark }));
  }

  async findMark(id: string) {
    const found = this.marks.find((mark) => mark.id === id);
    return found ? { ...found } : null;
  }

  private insert(input: NewAttendanceMark): AttendanceMark {
    this.seq += 1;
    const createdBy = this.staff.find((person) => person.id === input.createdById);
    const mark: AttendanceMark = {
      id: `m${this.seq}`,
      ...input,
      createdByName: createdBy?.name ?? null,
      voidedAt: null,
      voidedById: null,
      voidedByName: null,
      voidReason: null,
      createdAt: this.clock.now,
    };
    this.marks.push(mark);
    return { ...mark };
  }

  async markNow(input: { userId: string; createdById: string; origin: "PROPIA" | "ADMIN"; decide: DecideMark }) {
    const now = this.clock.now;
    const recent = this.marks.filter((mark) => mark.userId === input.userId).map((mark) => ({ ...mark }));
    const { kind, day } = input.decide(recent, now);
    return this.insert({
      userId: input.userId,
      kind,
      markedAt: now,
      day,
      origin: input.origin,
      createdById: input.createdById,
      reason: null,
      correctsId: null,
    });
  }

  async create(mark: NewAttendanceMark) {
    return this.insert(mark);
  }

  async voidMark(input: { id: string; voidedById: string; reason: string; replacement: NewAttendanceMark | null }) {
    const target = this.marks.find((mark) => mark.id === input.id);
    if (!target || target.voidedAt) return { voided: false, replacement: null };
    target.voidedAt = this.clock.now;
    target.voidedById = input.voidedById;
    target.voidReason = input.reason;
    const replacement = input.replacement ? this.insert(input.replacement) : null;
    return { voided: true, replacement };
  }
}

const staff: AttendanceStaff[] = [
  { id: "alex", name: "Alexander", role: "ADMIN", startDate: null, endDate: null, hasTeamRecord: true },
  { id: "emanuel", name: "Emanuel Díaz", role: "EMPLEADO", startDate: "2026-10-15", endDate: null, hasTeamRecord: true },
  { id: "ingrid", name: "Ingrid", role: "EMPLEADO", startDate: null, endDate: null, hasTeamRecord: true },
  { id: "genesis", name: "Génesis", role: "EMPLEADO", startDate: null, endDate: "2026-10-20", hasTeamRecord: true },
  { id: "nuevo", name: "Nuevo", role: "EMPLEADO", startDate: "2026-11-15", endDate: null, hasTeamRecord: true },
  // Usuario admin generico sin ficha de Equipo: no se lista salvo que marque.
  { id: "soporte", name: "Soporte", role: "ADMIN", startDate: null, endDate: null, hasTeamRecord: false },
];

let clock: { now: Date };
let repo: MemoryRepo;

beforeEach(() => {
  clock = { now: at("2026-11-02", "08:00") };
  repo = new MemoryRepo(staff, clock);
});

describe("marcar con la hora del servidor", () => {
  it("doble clic en ENTRADA: el segundo se rechaza y queda una sola entrada", async () => {
    const first = await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    expect(first).toMatchObject({ kind: "ENTRADA", day: "2026-11-02", origin: "PROPIA", createdById: "emanuel" });
    expect(first.markedAt).toEqual(at("2026-11-02", "08:00"));

    await expect(markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now)).rejects.toBeInstanceOf(AttendanceInputError);
    await expect(markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now)).rejects.toThrow("Ya está trabajando desde las 08:00");
    expect(repo.marks.filter((mark) => mark.kind === "ENTRADA")).toHaveLength(1);
  });

  it("salida sin entrada se rechaza", async () => {
    await expect(markOwnAttendanceUseCase(repo, "emanuel", "SALIDA", clock.now)).rejects.toThrow("No hay una entrada abierta");
    expect(repo.marks).toHaveLength(0);
  });

  it("entrada y salida normales", async () => {
    await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    clock.now = at("2026-11-02", "17:00");
    const exit = await markOwnAttendanceUseCase(repo, "emanuel", "SALIDA", clock.now);
    expect(exit).toMatchObject({ kind: "SALIDA", day: "2026-11-02" });
  });

  it("salida de madrugada queda en el dia de la entrada", async () => {
    clock.now = at("2026-11-01", "22:00");
    await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    clock.now = at("2026-11-02", "02:00");
    const exit = await markOwnAttendanceUseCase(repo, "emanuel", "SALIDA", clock.now);
    expect(exit.day).toBe("2026-11-01");
  });

  it("un admin marca por otra persona con origen ADMIN", async () => {
    const { mark, person } = await markForPersonUseCase(repo, "alex", "ingrid", "ENTRADA", clock.now);
    expect(person.id).toBe("ingrid");
    expect(mark).toMatchObject({ userId: "ingrid", origin: "ADMIN", createdById: "alex" });
    await expect(markForPersonUseCase(repo, "alex", "fantasma", "ENTRADA")).rejects.toThrow("no es un trabajador");
  });
});

describe("addMissingMarkUseCase", () => {
  const now = at("2026-11-03", "10:00");

  it("sin motivo se rechaza y no crea nada", async () => {
    await expect(
      addMissingMarkUseCase(repo, "alex", "emanuel", { kind: "SALIDA", day: "2026-11-02", time: "17:00", nextDay: false, reason: " " }, now),
    ).rejects.toBeInstanceOf(AttendanceInputError);
    expect(repo.marks).toHaveLength(0);
  });

  it("con motivo crea la marca con origen CORRECCION, quien la agrego y el motivo", async () => {
    const { mark } = await addMissingMarkUseCase(
      repo,
      "alex",
      "emanuel",
      { kind: "SALIDA", day: "2026-11-02", time: "17:00", nextDay: false, reason: "Olvido marcar la salida" },
      now,
    );
    expect(mark).toMatchObject({
      userId: "emanuel",
      kind: "SALIDA",
      day: "2026-11-02",
      origin: "CORRECCION",
      createdById: "alex",
      reason: "Olvido marcar la salida",
      correctsId: null,
    });
    expect(mark.markedAt).toEqual(at("2026-11-02", "17:00"));
  });

  it("salida despues de medianoche (nextDay) suma un dia a la hora pero no al dia de trabajo", async () => {
    const { mark } = await addMissingMarkUseCase(
      repo,
      "alex",
      "emanuel",
      { kind: "SALIDA", day: "2026-11-01", time: "02:00", nextDay: true, reason: "Turno de noche" },
      now,
    );
    expect(mark.day).toBe("2026-11-01");
    expect(mark.markedAt).toEqual(at("2026-11-02", "02:00"));
  });

  it("hora futura se rechaza", async () => {
    await expect(
      addMissingMarkUseCase(repo, "alex", "emanuel", { kind: "ENTRADA", day: "2026-11-03", time: "11:00", nextDay: false, reason: "Llego tarde" }, now),
    ).rejects.toThrow("no puede ser futura");
    expect(repo.marks).toHaveLength(0);
  });

  it("hora invalida y persona desconocida se rechazan", async () => {
    await expect(
      addMissingMarkUseCase(repo, "alex", "emanuel", { kind: "ENTRADA", day: "2026-11-02", time: "25:00", nextDay: false, reason: "Llego tarde" }, now),
    ).rejects.toThrow("Hora inválida");
    await expect(
      addMissingMarkUseCase(repo, "alex", "fantasma", { kind: "ENTRADA", day: "2026-11-02", time: "08:00", nextDay: false, reason: "Llego tarde" }, now),
    ).rejects.toThrow("no es un trabajador");
  });
});

describe("correctMarkUseCase y voidMarkUseCase", () => {
  const now = at("2026-11-02", "18:00");

  it("corregir anula la original (no la borra) y crea la nueva con correctsId", async () => {
    const original = await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    const { mark } = await correctMarkUseCase(
      repo,
      "alex",
      original.id,
      { kind: "ENTRADA", day: "2026-11-02", time: "07:30", nextDay: false, reason: "Llego a las 7:30" },
      now,
    );
    expect(repo.marks).toHaveLength(2);
    const stored = repo.marks.find((item) => item.id === original.id)!;
    expect(stored.voidedAt).not.toBeNull();
    expect(stored).toMatchObject({ voidedById: "alex", voidReason: "Llego a las 7:30" });
    expect(mark).toMatchObject({ origin: "CORRECCION", correctsId: original.id, userId: "emanuel", createdById: "alex" });
    expect(mark.markedAt).toEqual(at("2026-11-02", "07:30"));
  });

  it("corregir una marca ya anulada falla", async () => {
    const original = await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    await voidMarkUseCase(repo, "alex", original.id, "Entrada repetida");
    await expect(
      correctMarkUseCase(repo, "alex", original.id, { kind: "ENTRADA", day: "2026-11-02", time: "07:30", nextDay: false, reason: "Llego a las 7:30" }, now),
    ).rejects.toThrow("ya estaba anulada");
    expect(repo.marks).toHaveLength(1);
  });

  it("corregir sin motivo o una marca inexistente falla", async () => {
    const original = await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    await expect(
      correctMarkUseCase(repo, "alex", original.id, { kind: "ENTRADA", day: "2026-11-02", time: "07:30", nextDay: false, reason: "" }, now),
    ).rejects.toThrow("motivo es obligatorio");
    await expect(
      correctMarkUseCase(repo, "alex", "no-existe", { kind: "ENTRADA", day: "2026-11-02", time: "07:30", nextDay: false, reason: "Llego temprano" }, now),
    ).rejects.toThrow("No se encontró");
  });

  it("anular deja la marca guardada pero sin efecto; anular dos veces falla", async () => {
    const original = await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    await expect(voidMarkUseCase(repo, "alex", original.id, "no")).rejects.toThrow("motivo es obligatorio");
    const voided = await voidMarkUseCase(repo, "alex", original.id, "Entrada por error");
    expect(voided.id).toBe(original.id);
    expect(repo.marks).toHaveLength(1);
    expect(repo.marks[0]).toMatchObject({ voidReason: "Entrada por error", voidedById: "alex" });
    await expect(voidMarkUseCase(repo, "alex", original.id, "Entrada por error")).rejects.toThrow("ya estaba anulada");
    // Al quedar anulada, vuelve a tocar ENTRADA.
    const my = await getMyAttendanceUseCase(repo, "emanuel", clock.now);
    expect(my.next.kind).toBe("ENTRADA");
    expect(my.today).toMatchObject({ worked: false, corrected: true });
  });
});

describe("getTodayBoardUseCase", () => {
  it("estados de hoy; excluye retirados y quien aun no ingresa", async () => {
    clock.now = at("2026-11-02", "08:00");
    await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    await markOwnAttendanceUseCase(repo, "ingrid", "ENTRADA", clock.now);
    clock.now = at("2026-11-02", "12:00");
    await markOwnAttendanceUseCase(repo, "ingrid", "SALIDA", clock.now);

    const board = await getTodayBoardUseCase(repo, at("2026-11-02", "14:00"));
    expect(board.today).toBe("2026-11-02");
    expect(board.rows.map((row) => [row.person.id, row.summary.status])).toEqual([
      ["emanuel", "TRABAJANDO"],
      ["ingrid", "SALIO"],
      ["alex", "NO_HA_LLEGADO"],
    ]);
    expect(board.rows.find((row) => row.person.id === "ingrid")!.summary.minutes).toBe(240);
  });

  it("turno de madrugada abierto se muestra en el dia de la entrada", async () => {
    clock.now = at("2026-11-01", "22:00");
    await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
    const board = await getTodayBoardUseCase(repo, at("2026-11-02", "02:00"));
    const row = board.rows.find((item) => item.person.id === "emanuel")!;
    expect(row.summary).toMatchObject({ day: "2026-11-01", status: "TRABAJANDO" });
  });

  it("el retirado aparece hasta su ultimo dia inclusive", async () => {
    const board = await getTodayBoardUseCase(repo, at("2026-10-20", "09:00"));
    expect(board.rows.some((row) => row.person.id === "genesis")).toBe(true);
    const after = await getTodayBoardUseCase(repo, at("2026-10-21", "09:00"));
    expect(after.rows.some((row) => row.person.id === "genesis")).toBe(false);
  });
});

describe("getWorkedDaysByMonthUseCase", () => {
  it("cuenta dias con entrada vigente del mes completo, por persona", async () => {
    for (const day of ["2026-11-02", "2026-11-03", "2026-11-30"]) {
      clock.now = at(day, "08:00");
      await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
      clock.now = at(day, "12:00");
      await markOwnAttendanceUseCase(repo, "emanuel", "SALIDA", clock.now);
      clock.now = at(day, "13:00");
      await markOwnAttendanceUseCase(repo, "emanuel", "ENTRADA", clock.now);
      clock.now = at(day, "17:00");
      await markOwnAttendanceUseCase(repo, "emanuel", "SALIDA", clock.now);
    }
    clock.now = at("2026-10-31", "08:00");
    await markOwnAttendanceUseCase(repo, "ingrid", "ENTRADA", clock.now);
    clock.now = at("2026-11-04", "08:00");
    const wrong = await markOwnAttendanceUseCase(repo, "ingrid", "ENTRADA", clock.now);
    await voidMarkUseCase(repo, "alex", wrong.id, "Marco por error");

    expect(bogotaDay(clock.now)).toBe("2026-11-04");
    expect(await getWorkedDaysByMonthUseCase(repo, "2026-11")).toEqual({ emanuel: 3 });
    expect(await getWorkedDaysByMonthUseCase(repo, "2026-10")).toEqual({ ingrid: 1 });
  });

  it("mes invalido se rechaza", async () => {
    await expect(getWorkedDaysByMonthUseCase(repo, "2026-1")).rejects.toBeInstanceOf(AttendanceInputError);
    await expect(getWorkedDaysByMonthUseCase(repo, "2026-13")).rejects.toBeInstanceOf(AttendanceInputError);
  });
});

describe("retirados y usuarios sin ficha", () => {
  it("un retirado no puede marcar, ni un admin por el, ni agregarle un dia despues de su salida", async () => {
    clock.now = at("2026-11-02", "08:00");
    await expect(markOwnAttendanceUseCase(repo, "genesis", "ENTRADA", clock.now)).rejects.toThrow("salió el 2026-10-20");
    await expect(markForPersonUseCase(repo, "alex", "genesis", "ENTRADA", clock.now)).rejects.toBeInstanceOf(
      AttendanceInputError,
    );
    await expect(
      addMissingMarkUseCase(
        repo,
        "alex",
        "genesis",
        { kind: "ENTRADA", day: "2026-10-25", time: "08:00", nextDay: false, reason: "Olvido marcar" },
        clock.now,
      ),
    ).rejects.toBeInstanceOf(AttendanceInputError);
    expect(repo.marks).toHaveLength(0);
  });

  it("antes de su fecha de ingreso no se marca", async () => {
    clock.now = at("2026-11-02", "08:00");
    await expect(markOwnAttendanceUseCase(repo, "nuevo", "ENTRADA", clock.now)).rejects.toThrow("ingresa el 2026-11-15");
  });

  it("un usuario sin ficha de Equipo no sale en Hoy salvo que marque", async () => {
    clock.now = at("2026-11-02", "08:00");
    const before = await getTodayBoardUseCase(repo, clock.now);
    expect(before.rows.some((row) => row.person.id === "soporte")).toBe(false);
    await markOwnAttendanceUseCase(repo, "soporte", "ENTRADA", clock.now);
    const after = await getTodayBoardUseCase(repo, at("2026-11-02", "09:00"));
    expect(after.rows.find((row) => row.person.id === "soporte")?.summary.status).toBe("TRABAJANDO");
  });
});
