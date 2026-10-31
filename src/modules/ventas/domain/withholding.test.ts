import { describe, expect, it } from "vitest";

import {
  WITHHOLDING_ACCOUNT_VALUE,
  WITHHOLDING_CERTIFICATE_MAX,
  WITHHOLDING_LABEL,
  bogotaDateKey,
  bogotaMonthKey,
  buildWithholdingReport,
  isWithholdingAccountValue,
  parseWithholdingCertificate,
  parseWithholdingMonth,
  paymentMethodLabel,
  withholdingPaymentDateYearRange,
  withholdingRowDate,
  withholdingYearRange,
  withholdingsCsv,
  type WithholdingRow,
} from "./withholding";

function row(partial: Partial<WithholdingRow> & { id: string; date: Date }): WithholdingRow {
  return {
    saleCode: "SAL-00001",
    clientName: "Cliente",
    clientTaxId: null,
    amount: 0,
    certificate: null,
    ...partial,
  };
}

describe("isWithholdingAccountValue", () => {
  it("reconoce el valor especial de la retención", () => {
    expect(isWithholdingAccountValue(WITHHOLDING_ACCOUNT_VALUE)).toBe(true);
    expect(isWithholdingAccountValue("__retencion_fuente__")).toBe(true);
  });

  it("acepta el valor especial con espacios alrededor", () => {
    expect(isWithholdingAccountValue(`  ${WITHHOLDING_ACCOUNT_VALUE}\n`)).toBe(true);
  });

  it("no confunde ids normales de cuenta", () => {
    expect(isWithholdingAccountValue("clx1abc2def3ghi4jkl")).toBe(false);
    expect(isWithholdingAccountValue("")).toBe(false);
    expect(isWithholdingAccountValue("retencion_fuente")).toBe(false);
  });

  it("rechaza valores que no son texto", () => {
    expect(isWithholdingAccountValue(null)).toBe(false);
    expect(isWithholdingAccountValue(undefined)).toBe(false);
    expect(isWithholdingAccountValue(123)).toBe(false);
    expect(isWithholdingAccountValue({ value: WITHHOLDING_ACCOUNT_VALUE })).toBe(false);
  });
});

describe("parseWithholdingCertificate", () => {
  it("vacío o sin texto da null", () => {
    expect(parseWithholdingCertificate("")).toEqual({ ok: true, certificate: null });
    expect(parseWithholdingCertificate("   ")).toEqual({ ok: true, certificate: null });
    expect(parseWithholdingCertificate(null)).toEqual({ ok: true, certificate: null });
    expect(parseWithholdingCertificate(undefined)).toEqual({ ok: true, certificate: null });
    expect(parseWithholdingCertificate(42)).toEqual({ ok: true, certificate: null });
  });

  it("recorta y colapsa los espacios", () => {
    expect(parseWithholdingCertificate("  CR   2026 \t 001  ")).toEqual({ ok: true, certificate: "CR 2026 001" });
  });

  it("acepta exactamente el tope de caracteres", () => {
    const text = "A".repeat(WITHHOLDING_CERTIFICATE_MAX);
    expect(parseWithholdingCertificate(text)).toEqual({ ok: true, certificate: text });
  });

  it("más largo que el tope da error", () => {
    const result = parseWithholdingCertificate("A".repeat(WITHHOLDING_CERTIFICATE_MAX + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(WITHHOLDING_CERTIFICATE_MAX));
  });
});

describe("paymentMethodLabel", () => {
  it("retención sin certificado dice solo la etiqueta", () => {
    expect(paymentMethodLabel({ isWithholding: true })).toBe(WITHHOLDING_LABEL);
    expect(paymentMethodLabel({ isWithholding: true, withholdingCertificate: "   " })).toBe(WITHHOLDING_LABEL);
  });

  it("retención con certificado lo agrega", () => {
    expect(paymentMethodLabel({ isWithholding: true, withholdingCertificate: " 123 " })).toBe(
      "Retención en la fuente · Cert. 123",
    );
  });

  it("la retención ignora cuenta y medio guardado", () => {
    expect(paymentMethodLabel({ isWithholding: true, accountName: "Bancolombia", paymentMethod: "TRANSFER" })).toBe(
      WITHHOLDING_LABEL,
    );
  });

  it("abono normal muestra el nombre de la cuenta", () => {
    expect(paymentMethodLabel({ accountName: " Bancolombia ", paymentMethod: "TRANSFER" })).toBe("Bancolombia");
  });

  it("sin cuenta cae al medio guardado", () => {
    expect(paymentMethodLabel({ isWithholding: false, accountName: "  ", paymentMethod: "Efectivo" })).toBe("Efectivo");
  });

  it("sin nada dice 'Sin medio'", () => {
    expect(paymentMethodLabel({})).toBe("Sin medio");
    expect(paymentMethodLabel({ accountName: null, paymentMethod: " " })).toBe("Sin medio");
  });
});

describe("withholdingRowDate (fecha del abono sin correrse de dia)", () => {
  it("la fecha escrita (medianoche UTC) conserva su dia y su mes en Colombia", () => {
    // Asi la guarda el formulario: z.coerce.date("2026-10-01") = 2026-10-01T00:00Z.
    const date = withholdingRowDate(new Date("2026-10-01"), new Date("2026-10-05T20:00:00Z"));
    expect(bogotaDateKey(date)).toBe("2026-10-01");
    expect(bogotaMonthKey(date)).toBe("2026-10");
  });

  it("el 1 de enero no cae en el año anterior", () => {
    const date = withholdingRowDate(new Date("2026-01-01"), new Date("2026-01-02T15:00:00Z"));
    expect(bogotaMonthKey(date)).toBe("2026-01");
  });

  it("sin fecha escrita usa el dia en Colombia del registro", () => {
    const date = withholdingRowDate(null, new Date("2026-11-01T03:00:00Z"));
    expect(bogotaDateKey(date)).toBe("2026-10-31");
  });

  it("el reporte de octubre incluye una retencion del 1-oct guardada como medianoche UTC", () => {
    const report = buildWithholdingReport("2026-10", [
      row({ id: "x", date: withholdingRowDate(new Date("2026-10-01"), new Date()), saleCode: "SAL-00070", amount: 113575 }),
    ]);
    expect(report.monthTotal).toBe(113575);
    expect(report.rows).toHaveLength(1);
  });
});

describe("withholdingPaymentDateYearRange", () => {
  it("va de 1-ene a 1-ene en UTC (fechas de calendario)", () => {
    const range = withholdingPaymentDateYearRange("2026-10");
    expect(range.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("bogotaMonthKey y bogotaDateKey", () => {
  it("una madrugada UTC del 1 de noviembre todavía es octubre en Colombia", () => {
    const date = new Date("2026-11-01T03:00:00Z");
    expect(bogotaMonthKey(date)).toBe("2026-10");
    expect(bogotaDateKey(date)).toBe("2026-10-31");
  });

  it("desde las 05:00 UTC ya es el mes siguiente", () => {
    const date = new Date("2026-11-01T05:00:00Z");
    expect(bogotaMonthKey(date)).toBe("2026-11");
    expect(bogotaDateKey(date)).toBe("2026-11-01");
  });

  it("el cambio de año también respeta la hora de Colombia", () => {
    expect(bogotaMonthKey(new Date("2027-01-01T04:59:59Z"))).toBe("2026-12");
    expect(bogotaMonthKey(new Date("2027-01-01T05:00:00Z"))).toBe("2027-01");
  });
});

describe("parseWithholdingMonth", () => {
  const now = new Date("2026-11-01T03:00:00Z"); // 31-oct-2026 en Colombia

  it("acepta un mes válido (con espacios)", () => {
    expect(parseWithholdingMonth("2026-09", now)).toBe("2026-09");
    expect(parseWithholdingMonth(" 2025-12 ", now)).toBe("2025-12");
  });

  it("un mes inválido cae al mes actual en Colombia", () => {
    expect(parseWithholdingMonth("2026-13", now)).toBe("2026-10");
    expect(parseWithholdingMonth("2026-00", now)).toBe("2026-10");
    expect(parseWithholdingMonth("abc", now)).toBe("2026-10");
    expect(parseWithholdingMonth("2026-9", now)).toBe("2026-10");
    expect(parseWithholdingMonth(undefined, now)).toBe("2026-10");
    expect(parseWithholdingMonth(202610, now)).toBe("2026-10");
  });
});

describe("withholdingYearRange", () => {
  it("va del 1-ene a medianoche en Colombia hasta el 1-ene del año siguiente", () => {
    const range = withholdingYearRange("2026-10");
    expect(range.from.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(range.to.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });

  it("enero y diciembre dan el mismo rango", () => {
    expect(withholdingYearRange("2026-01")).toEqual(withholdingYearRange("2026-12"));
  });
});

describe("buildWithholdingReport", () => {
  const rows: WithholdingRow[] = [
    row({ id: "r1", date: new Date("2026-10-20T15:00:00Z"), saleCode: "SAL-00070", amount: 113575, certificate: "CR-1" }),
    row({ id: "r2", date: new Date("2026-10-05T15:00:00Z"), saleCode: "SAL-00065", amount: 50000.1 }),
    // 1-nov 03:00 UTC = 31-oct en Colombia: cuenta en octubre.
    row({ id: "r3", date: new Date("2026-11-01T03:00:00Z"), saleCode: "SAL-00071", amount: 10000.2 }),
    row({ id: "r4", date: new Date("2026-03-10T15:00:00Z"), saleCode: "SAL-00010", amount: 20000 }),
    row({ id: "r5", date: new Date("2026-11-10T15:00:00Z"), saleCode: "SAL-00080", amount: 7000 }),
    // Otro año: no entra a nada.
    row({ id: "r6", date: new Date("2025-10-15T15:00:00Z"), saleCode: "SAL-00001", amount: 999999 }),
    // 1-ene-2026 02:00 UTC = 31-dic-2025 en Colombia: otro año.
    row({ id: "r7", date: new Date("2026-01-01T02:00:00Z"), saleCode: "SAL-00002", amount: 888888 }),
  ];

  const report = buildWithholdingReport("2026-10", rows);

  it("filtra las del mes (en hora de Colombia) y las ordena por fecha", () => {
    expect(report.month).toBe("2026-10");
    expect(report.rows.map((r) => r.id)).toEqual(["r2", "r1", "r3"]);
  });

  it("total del mes", () => {
    expect(report.monthTotal).toBe(173575.3);
  });

  it("total del año ignora otros años", () => {
    expect(report.yearTotal).toBe(200575.3);
  });

  it("byMonth ordenado por mes", () => {
    expect(report.byMonth).toEqual([
      { month: "2026-03", total: 20000 },
      { month: "2026-10", total: 173575.3 },
      { month: "2026-11", total: 7000 },
    ]);
  });

  it("a igual fecha desempata por código de venta", () => {
    const date = new Date("2026-10-20T15:00:00Z");
    const result = buildWithholdingReport("2026-10", [
      row({ id: "b", date, saleCode: "SAL-00072", amount: 1 }),
      row({ id: "a", date, saleCode: "SAL-00070", amount: 1 }),
    ]);
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("caso real: SAL-00070 con 113575", () => {
    const result = buildWithholdingReport("2026-10", [
      row({ id: "x", date: new Date("2026-10-22T17:00:00Z"), saleCode: "SAL-00070", amount: 113575 }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.monthTotal).toBe(113575);
    expect(result.yearTotal).toBe(113575);
    expect(result.byMonth).toEqual([{ month: "2026-10", total: 113575 }]);
  });

  it("sin filas da totales en cero", () => {
    expect(buildWithholdingReport("2026-10", [])).toEqual({
      month: "2026-10",
      rows: [],
      monthTotal: 0,
      yearTotal: 0,
      byMonth: [],
    });
  });

  it("no modifica el arreglo recibido", () => {
    const copy = rows.map((r) => r.id);
    buildWithholdingReport("2026-10", rows);
    expect(rows.map((r) => r.id)).toEqual(copy);
  });
});

describe("withholdingsCsv", () => {
  const report = buildWithholdingReport("2026-10", [
    row({
      id: "r1",
      date: new Date("2026-10-20T15:00:00Z"),
      saleCode: "SAL-00070",
      clientName: "Salón; Belleza",
      clientTaxId: "900123456-1",
      amount: 113575,
      certificate: "CR-1",
    }),
    row({
      id: "r2",
      date: new Date("2026-11-01T03:00:00Z"),
      saleCode: "SAL-00071",
      clientName: 'Peluquería "La 10"',
      amount: 1000,
      certificate: "=HYPERLINK(\"x\")",
    }),
  ]);
  const csv = withholdingsCsv(report);
  const lines = csv.replace(/^﻿/, "").split("\r\n");

  it("empieza con BOM y termina en salto de línea", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("encabezado separado por ';'", () => {
    expect(lines[0]).toBe("Fecha;Venta;Cliente;NIT/Cédula;Valor retenido;Certificado");
  });

  it("pone comillas a valores con ';'", () => {
    expect(lines[1]).toBe('2026-10-20;SAL-70;"Salón; Belleza";900123456-1;113575;CR-1');
  });

  it("duplica comillas, usa fecha de Colombia y protege fórmulas", () => {
    expect(lines[2]).toBe(`2026-10-31;SAL-71;"Peluquería ""La 10""";;1000;"'=HYPERLINK(""x"")"`);
  });

  it("protege fórmulas sin comillas", () => {
    const simple = withholdingsCsv(
      buildWithholdingReport("2026-10", [
        row({ id: "f", date: new Date("2026-10-20T15:00:00Z"), clientName: "=1+1", certificate: "+57", amount: 5 }),
      ]),
    );
    const line = simple.replace(/^﻿/, "").split("\r\n")[1];
    expect(line).toBe("2026-10-20;SAL-1;'=1+1;;5;'+57");
  });

  it("fila final con el total del mes", () => {
    expect(lines[3]).toBe(";;;Total del mes;114575;");
    expect(lines[4]).toBe("");
    expect(lines).toHaveLength(5);
  });

  it("sin filas solo trae encabezado y total en cero", () => {
    const empty = withholdingsCsv(buildWithholdingReport("2026-10", []));
    expect(empty).toBe("﻿Fecha;Venta;Cliente;NIT/Cédula;Valor retenido;Certificado\r\n;;;Total del mes;0;\r\n");
  });
});
