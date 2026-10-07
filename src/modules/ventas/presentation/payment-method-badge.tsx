import {
  isSalePaymentMethod,
  PAYMENT_METHOD_BADGE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_SHORT_LABEL,
} from "../domain/payment-method";

// Badge corto de la forma de pago ("50/50" / "Contraentrega"). Sin forma de pago no muestra nada,
// salvo showUnset (muestra "Pago sin definir").
export function PaymentMethodBadge({
  method,
  showUnset = false,
}: {
  method: string | null | undefined;
  showUnset?: boolean;
}) {
  if (!isSalePaymentMethod(method)) {
    return showUnset ? (
      <span className="inline-flex rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        Pago sin definir
      </span>
    ) : null;
  }
  return (
    <span
      title={PAYMENT_METHOD_LABEL[method]}
      className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${PAYMENT_METHOD_BADGE[method]}`}
    >
      {PAYMENT_METHOD_SHORT_LABEL[method]}
    </span>
  );
}
