// Fletes viejos sin cuenta (ShippingCost sin cuenta y sin pago enlazado). Para no restar dos
// veces, junto a cada flete se muestran los pagos de Proveedores que podrian ser ese mismo flete:
// mismo transportador, misma venta (o su orden), con cuenta y todavia sin enlazar a otro flete.
// Nada se enlaza solo: la persona elige.

export type FreightWithoutAccount = { id: string; saleId: string; shippingProvider: string };
export type FreightPaymentCandidate = { id: string; saleId: string | null; supplierName: string };

export function normalizeCarrierName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function matchFreightPayments<P extends FreightPaymentCandidate>(
  freight: FreightWithoutAccount,
  payments: P[],
): P[] {
  const carrier = normalizeCarrierName(freight.shippingProvider);
  return payments.filter(
    (payment) => payment.saleId === freight.saleId && normalizeCarrierName(payment.supplierName) === carrier,
  );
}
