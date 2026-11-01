import { describe, expect, it } from "vitest";
import {
  colombiaDayKey,
  colombiaDayRange,
  colombiaMonthKey,
  colombiaMonthRange,
  dbWindow,
  inColombiaPeriod,
  todayInColombia,
} from "./colombia-time";

const d = (iso: string) => new Date(iso);

describe("colombia-time", () => {
  it("23:30 del 31-oct en Colombia cuenta en octubre", () => {
    expect(colombiaMonthKey(d("2026-11-01T04:30:00Z"))).toBe("2026-10");
    expect(inColombiaPeriod(d("2026-11-01T04:30:00Z"), "2026-10")).toBe(true);
    expect(inColombiaPeriod(d("2026-11-01T04:30:00Z"), "2026-11")).toBe(false);
  });

  it("00:30 del 1-nov en Colombia cuenta en noviembre", () => {
    expect(colombiaMonthKey(d("2026-11-01T05:30:00Z"))).toBe("2026-11");
    expect(inColombiaPeriod(d("2026-11-01T05:30:00Z"), colombiaMonthRange("2026-11"))).toBe(true);
  });

  it("fecha escrita '2026-11-01' (medianoche UTC) cuenta el 1-nov", () => {
    expect(colombiaDayKey(d("2026-11-01T00:00:00.000Z"))).toBe("2026-11-01");
    expect(inColombiaPeriod(d("2026-11-01T00:00:00.000Z"), "2026-11")).toBe(true);
    expect(inColombiaPeriod(d("2026-11-01T00:00:00.000Z"), "2026-10")).toBe(false);
  });

  it("los mediodias cuentan el 31-oct", () => {
    expect(colombiaDayKey(d("2026-10-31T12:00:00Z"))).toBe("2026-10-31");
    expect(colombiaDayKey(d("2026-10-31T17:00:00Z"))).toBe("2026-10-31");
  });

  it("paso de diciembre a enero", () => {
    expect(colombiaMonthRange("2026-12")).toEqual({
      start: d("2026-12-01T05:00:00.000Z"),
      end: d("2027-01-01T05:00:00.000Z"),
    });
    expect(colombiaMonthKey(d("2027-01-01T04:59:00Z"))).toBe("2026-12");
    expect(colombiaMonthKey(d("2027-01-01T05:00:00Z"))).toBe("2027-01");
    expect(colombiaMonthKey(d("2027-01-01T00:00:00.000Z"))).toBe("2027-01");
  });

  it("todayInColombia a las 21:00 del 31-oct da el 31-oct", () => {
    expect(todayInColombia(d("2026-11-01T02:00:00Z"))).toBe("2026-10-31");
    // El ahora es un momento real: medianoche UTC son las 7 p. m. del dia anterior.
    expect(todayInColombia(d("2026-11-01T00:00:00.000Z"))).toBe("2026-10-31");
  });

  it("rango de un dia y ventana para la base", () => {
    const day = colombiaDayRange("2026-10-31");
    expect(day).toEqual({ start: d("2026-10-31T05:00:00.000Z"), end: d("2026-11-01T05:00:00.000Z") });
    expect(dbWindow(day).start).toEqual(d("2026-10-31T00:00:00.000Z"));
    expect(dbWindow(day).end).toEqual(day.end);
  });
});
