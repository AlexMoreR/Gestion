// Fletes viejos sin cuenta (ShippingCost sin accountId ni pago enlazado) y los pagos de
// Proveedores que podrian ser ese mismo flete. Nada se asigna solo: la pantalla
// "Fletes sin cuenta" los muestra juntos y la persona decide.

export type UnassignedFreight = { id: string; saleId: string; shippingProvider: string };

export type FreightPaymentCandidate = {
  id: string;
  saleId: string | null;
  supplierName: string;
  supplierDisplayName: string | null;
};

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Posibles pagos de cada flete: misma venta (el pago a la orden guarda su venta) y mismo
// transportador (el flete guarda el nombre del proveedor). Cada pago aparece en todos los
// fletes que encajan; al enlazarlo a uno deja de ser candidato de los demas.
export function matchFreightPayments<P extends FreightPaymentCandidate>(
  freights: UnassignedFreight[],
  payments: P[],
): Map<string, P[]> {
  const result = new Map<string, P[]>();
  for (const freight of freights) {
    const provider = normalizeName(freight.shippingProvider);
    result.set(
      freight.id,
      payments.filter(
        (payment) =>
          payment.saleId === freight.saleId &&
          provider !== "" &&
          (normalizeName(payment.supplierName) === provider || normalizeName(payment.supplierDisplayName) === provider),
      ),
    );
  }
  return result;
}
