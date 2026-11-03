import { describe, expect, it } from "vitest";
import { formatNoteDate, ORDER_NOTE_MAX, parseOrderNoteText } from "./order-notes";

describe("parseOrderNoteText", () => {
  it("rechaza vacía o solo espacios", () => {
    expect(parseOrderNoteText("").ok).toBe(false);
    expect(parseOrderNoteText("   \n  ").ok).toBe(false);
    expect(parseOrderNoteText(null).ok).toBe(false);
  });

  it("rechaza más de 1.000 letras y acepta justo 1.000", () => {
    expect(parseOrderNoteText("a".repeat(ORDER_NOTE_MAX + 1)).ok).toBe(false);
    expect(parseOrderNoteText("a".repeat(ORDER_NOTE_MAX)).ok).toBe(true);
  });

  it("deja la nota válida sin espacios de sobra", () => {
    expect(parseOrderNoteText("  esperando guía de Eliecer \n")).toEqual({ ok: true, text: "esperando guía de Eliecer" });
  });
});

describe("formatNoteDate", () => {
  it("da fecha y hora de Colombia", () => {
    expect(formatNoteDate(new Date("2026-11-03T15:42:00Z"))).toBe("2026-11-03 10:42");
  });

  it("antes de las 5 a. m. UTC sigue siendo el día anterior en Colombia", () => {
    expect(formatNoteDate(new Date("2026-11-04T03:10:00Z"))).toBe("2026-11-03 22:10");
    expect(formatNoteDate(new Date("2026-11-04T00:00:00Z"))).toBe("2026-11-03 19:00");
  });
});
