// Fletes viejos sin cuenta (ShippingCost sin cuenta y sin pago enlazado). Para no restar dos
// veces, junto a cada flete se muestran los pagos de Proveedores que podrian ser ese mismo flete:
// mismo transportador, misma venta (o su orden), con cuenta y todavia sin enlazar a otro flete.
// La persona elige; aparte, el cruce automatico de abajo corre una sola vez.

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

// Cruce automatico (una sola vez, decision del dueno 30-oct-2026): cada flete sin cuenta se une
// al pago al transportador que ya se hizo en Proveedores. Con dinero no se adivina: siempre el
// mismo monto, solo pagos a transportadoras con cuenta, y cada pago cubre un solo flete.
// Regla A: el pago es de la misma venta o de su orden; si hay varios, gana el del mismo
// transportador y luego el de fecha mas cercana.
// Regla B: el pago no tiene venta ni orden y esta a 5 dias o menos; solo si hay una sola pareja
// (o una sola del mismo transportador).
export type AutoLinkFreight = {
  id: string;
  saleId: string;
  orderId: string | null;
  shippingProvider: string;
  amount: number;
  date: Date;
};
export type AutoLinkPayment = {
  id: string;
  saleId: string | null; // venta del pago o de su orden
  orderId: string | null;
  supplierName: string;
  isCarrier: boolean; // proveedor de tipo transportadora
  hasAccount: boolean;
  amount: number;
  date: Date;
};
export type FreightLink = { freightId: string; paymentId: string; rule: "A" | "B" };

export const AUTO_LINK_MAX_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const cents = (value: number) => Math.round(value * 100);
const daysApart = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / DAY_MS;

export function planFreightAutoLink(freights: AutoLinkFreight[], payments: AutoLinkPayment[]): FreightLink[] {
  const usable = payments.filter((payment) => payment.isCarrier && payment.hasAccount);
  const used = new Set<string>();
  const links: FreightLink[] = [];
  const pending = [...freights].sort((a, b) => a.date.getTime() - b.date.getTime());
  const sameCarrier = (freight: AutoLinkFreight, payment: AutoLinkPayment) =>
    normalizeCarrierName(payment.supplierName) === normalizeCarrierName(freight.shippingProvider);
  const free = (freight: AutoLinkFreight) =>
    usable.filter((payment) => !used.has(payment.id) && cents(payment.amount) === cents(freight.amount));

  const take = (freight: AutoLinkFreight, payment: AutoLinkPayment, rule: "A" | "B") => {
    used.add(payment.id);
    links.push({ freightId: freight.id, paymentId: payment.id, rule });
  };

  // Regla A primero, para que un pago de la venta no se lo lleve otro flete por la regla B.
  const unmatched: AutoLinkFreight[] = [];
  for (const freight of pending) {
    const options = free(freight)
      .filter(
        (payment) =>
          payment.saleId === freight.saleId || (payment.orderId !== null && payment.orderId === freight.orderId),
      )
      .sort(
        (a, b) =>
          Number(sameCarrier(freight, b)) - Number(sameCarrier(freight, a)) ||
          daysApart(a.date, freight.date) - daysApart(b.date, freight.date),
      );
    if (options[0]) take(freight, options[0], "A");
    else unmatched.push(freight);
  }

  for (const freight of unmatched) {
    const options = free(freight).filter(
      (payment) =>
        payment.saleId === null &&
        payment.orderId === null &&
        daysApart(payment.date, freight.date) <= AUTO_LINK_MAX_DAYS,
    );
    const carrierOptions = options.filter((payment) => sameCarrier(freight, payment));
    const only = options.length === 1 ? options[0] : carrierOptions.length === 1 ? carrierOptions[0] : null;
    if (only) take(freight, only, "B");
  }

  return links;
}
