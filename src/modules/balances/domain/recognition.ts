// Cuando cuenta una venta en Balances (y en el informe y el asesor). Reglas puras, sin Prisma.
//
// Decision de Alexander (11-oct-2026): el recaudo y la entrega son cosas distintas. Una venta
// pagada por completo ya cuenta con su ganancia aunque falte entregarla (p. ej. clientes devueltos
// porque no habia guia); solo queda pendiente la entrega.
// - 50/50 o sin forma de pago: cuenta al quedar pagada por completo, en la fecha de ese pago.
// - Contraentrega: se cobra al entregar, asi que sigue contando solo con la orden entregada y en
//   la fecha de entrega.
// - Orden cancelada: no cuenta.

export type ProfitRecognitionInput = {
  paymentMethod: string | null;
  // Estado de la orden de venta; null = la venta no tiene orden.
  orderStatus: string | null;
  // Ultima entrega registrada (historial "Cerrada" o completedAt).
  deliveredAt: Date | null;
  // Fecha del pago con el que la venta quedo pagada por completo.
  fullyPaidAt: Date | null;
  saleCreatedAt: Date;
};

export type ProfitRecognition = {
  // Fecha que decide el mes en que cuenta la venta.
  recognizedAt: Date;
  // Pagada pero aun sin entregar: solo falta la entrega.
  pendingDelivery: boolean;
};

// Para una venta pagada por completo (facturada): si cuenta y en que fecha. null = no cuenta.
export function resolveProfitRecognition(input: ProfitRecognitionInput): ProfitRecognition | null {
  if (input.orderStatus === "CANCELLED") {
    return null;
  }

  const delivered = input.orderStatus === "COMPLETED";
  if (input.paymentMethod === "CONTRAENTREGA") {
    if (!delivered) {
      return null;
    }
    return {
      recognizedAt: input.deliveredAt ?? input.fullyPaidAt ?? input.saleCreatedAt,
      pendingDelivery: false,
    };
  }

  return {
    recognizedAt: input.fullyPaidAt ?? input.deliveredAt ?? input.saleCreatedAt,
    pendingDelivery: !delivered,
  };
}

// Fecha en que lo pagado alcanzo el total de la venta (null si nunca lo alcanzo).
// `recordedPaid` es lo pagado guardado en la venta (downPaymentAmount); si es mayor que la suma
// de los abonos (ventas viejas), la diferencia se toma como pagada al crear la venta.
export function computeFullyPaidAt(input: {
  total: number;
  recordedPaid: number;
  saleCreatedAt: Date;
  payments: Array<{ amount: number; date: Date }>;
}): Date | null {
  if (input.total <= 0) {
    return input.saleCreatedAt;
  }

  const payments = [...input.payments];
  const legacy = input.recordedPaid - payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (legacy > 0.5) {
    payments.push({ amount: legacy, date: input.saleCreatedAt });
  }
  payments.sort((left, right) => left.date.getTime() - right.date.getTime());

  let paid = 0;
  for (const payment of payments) {
    paid += payment.amount;
    if (paid >= input.total - 0.5) {
      return payment.date;
    }
  }
  return null;
}
