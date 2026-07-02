// Topes tributarios DIAN para persona natural (no responsable de IVA).
// Ambos limites se miden en UVT sobre el acumulado del ANIO y se comparan
// contra los ingresos brutos (ventas reales) del periodo.
//
//  - IVA:   3.500 UVT -> si se supera, hay que pasar a responsable de IVA.
//  - Renta: 1.400 UVT -> si se supera, hay obligacion de declarar renta.
//
// La UVT cambia cada anio (la fija la DIAN), por eso se recibe como parametro
// configurable en lugar de quemarla aqui.

export const IVA_UVT_LIMIT = 3500;
export const RENTA_UVT_LIMIT = 1400;

// Umbrales de alerta sobre el porcentaje de consumo del tope.
export const THRESHOLD_WARNING_PCT = 80;
export const THRESHOLD_DANGER_PCT = 90;

export type ThresholdStatus = "ok" | "warning" | "danger" | "over";

export type TaxThresholdMeter = {
  key: "iva" | "renta";
  label: string;
  description: string;
  limitUvt: number;
  limitAmount: number;
  usedAmount: number;
  // Porcentaje consumido del tope (puede superar 100 si ya se paso).
  percent: number;
  status: ThresholdStatus;
  remaining: number;
};

export function resolveThresholdStatus(percent: number): ThresholdStatus {
  if (percent >= 100) {
    return "over";
  }
  if (percent >= THRESHOLD_DANGER_PCT) {
    return "danger";
  }
  if (percent >= THRESHOLD_WARNING_PCT) {
    return "warning";
  }
  return "ok";
}

function buildMeter(
  key: TaxThresholdMeter["key"],
  label: string,
  description: string,
  usedAmount: number,
  limitUvt: number,
  uvt: number,
): TaxThresholdMeter {
  const limitAmount = limitUvt * uvt;
  const percent = limitAmount > 0 ? (usedAmount / limitAmount) * 100 : 0;

  return {
    key,
    label,
    description,
    limitUvt,
    limitAmount,
    usedAmount,
    percent,
    status: resolveThresholdStatus(percent),
    remaining: Math.max(0, limitAmount - usedAmount),
  };
}

// Calcula ambos medidores (IVA y renta) para un total anual de ventas dado.
export function computeTaxThresholds(annualSales: number, uvt: number): TaxThresholdMeter[] {
  const safeSales = Number.isFinite(annualSales) && annualSales > 0 ? annualSales : 0;
  const safeUvt = Number.isFinite(uvt) && uvt > 0 ? uvt : 0;

  return [
    buildMeter(
      "iva",
      "Tope de IVA",
      "Si lo superas, debes pasar a responsable de IVA (cobrar 19%).",
      safeSales,
      IVA_UVT_LIMIT,
      safeUvt,
    ),
    buildMeter(
      "renta",
      "Tope de renta",
      "Si lo superas, quedas obligado a declarar renta.",
      safeSales,
      RENTA_UVT_LIMIT,
      safeUvt,
    ),
  ];
}
