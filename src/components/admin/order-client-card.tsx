import Link from "next/link";
import { ArrowUpRight, Edit3, MessageCircle } from "lucide-react";
import { CarrierMessageButton } from "@/components/admin/carrier-message-button";
import { OrderClientAccordion } from "@/components/admin/order-client-accordion";
import { buttonVariants } from "@/components/ui/button";
import { displayCode } from "@/lib/code-display";
import { whatsAppDigits, type OrderDeliveryInfo } from "@/lib/order-delivery-info";

type OrderClientCardProps = {
  name: string | null | undefined;
  phone: string | null | undefined;
  instagram: string | null | undefined;
  delivery: OrderDeliveryInfo;
  quote: {
    id: string;
    code: string;
    shareToken: string;
    notes: string | null;
    date: string;
    by: string;
  } | null;
  canEditQuote: boolean;
  /** Línea 1: código, venta y estado (izquierda) y el menú ⋯ (derecha, después de los botones). */
  title: React.ReactNode;
  menu: React.ReactNode;
  /** Línea 2, después de la ciudad: forma de pago y origen en texto pequeño. */
  summaryExtra: React.ReactNode;
};

function SinDato() {
  return <span className="text-amber-700 dark:text-amber-400">Sin dato</span>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{children}</p>;
}

// Encabezado de la orden de venta: a quién llamar, a dónde va y de qué cotización salió.
export function OrderClientCard({
  name,
  phone,
  instagram,
  delivery,
  quote,
  canEditQuote,
  title,
  menu,
  summaryExtra,
}: OrderClientCardProps) {
  const whatsApp = whatsAppDigits(phone);
  const instagramHandle = instagram?.trim().replace(/^@+/, "");

  return (
        <OrderClientAccordion
          title={title}
          summary={
            <>
              <span className="sr-only">Cliente y entrega: </span>
              <span className="font-medium text-foreground">{name?.trim() || <SinDato />}</span>
              {" · "}
              {phone?.trim() || <SinDato />}
              {" · "}
              {delivery.pickup ? "Recoge en bodega" : delivery.city ?? <SinDato />}
              {summaryExtra}
            </>
          }
          actions={
            <>
              {whatsApp ? (
                <a
                  href={`https://wa.me/${whatsApp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              ) : null}
              {!delivery.pickup ? (
                <CarrierMessageButton
                  message={delivery.copyText}
                  disabled={!delivery.copyText}
                  label="Copiar datos de envío"
                  copiedMessage="Datos de envío copiados"
                />
              ) : null}
              {quote ? (
                <Link
                  href={`/cotizaciones/${quote.shareToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ArrowUpRight /> Ver cotización
                </Link>
              ) : null}
              {menu}
            </>
          }
        >
          <div className="grid gap-4 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
            <div className="min-w-0 space-y-1 md:pr-4">
              <Heading>Cliente</Heading>
              {/* El nombre ya va en la línea de arriba: aquí no se repite. */}
              <p className="text-foreground">{phone?.trim() || <SinDato />}</p>
              {instagramHandle ? <p className="break-words text-muted-foreground">@{instagramHandle}</p> : null}
            </div>

            <div className="min-w-0 space-y-1 md:px-4">
              <Heading>Entrega{delivery.dispatchCode ? ` · Despacho ${displayCode(delivery.dispatchCode)}` : ""}</Heading>
              {delivery.pickup ? (
                <p className="font-medium text-foreground">Recoge en bodega</p>
              ) : (
                <>
                  {!delivery.dispatchCode ? (
                    <p className="text-xs text-muted-foreground">Ficha del cliente (aún sin despacho)</p>
                  ) : null}
                  <p className="break-words font-medium text-foreground">{delivery.address ?? <SinDato />}</p>
                  <p className="break-words text-foreground">{delivery.city ?? <SinDato />}</p>
                  {delivery.currentClientAddress ? (
                    <p className="break-words text-xs text-muted-foreground">Ficha actual: {delivery.currentClientAddress}</p>
                  ) : null}
                  {delivery.dispatchCode ? (
                    <p className="break-words text-muted-foreground">
                      {delivery.carrier ?? <SinDato />} · Guía: {delivery.tracking ?? <SinDato />}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div className="min-w-0 space-y-1 md:pl-4">
              <Heading>Cotización{quote ? ` ${displayCode(quote.code)}` : ""}</Heading>
              {quote ? (
                <>
                  <p className="break-words text-foreground">
                    {quote.date} · {quote.by}
                  </p>
                  {quote.notes?.trim() ? (
                    <p className="line-clamp-3 whitespace-pre-line break-words text-muted-foreground" title={quote.notes}>
                      {quote.notes}
                    </p>
                  ) : null}
                  {canEditQuote ? (
                    <div className="pt-1">
                      <Link
                        href={`/admin/cotizaciones/${quote.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <Edit3 /> Editar
                      </Link>
                    </div>
                  ) : null}
                </>
              ) : (
                <p>
                  <SinDato />
                </p>
              )}
            </div>
          </div>
        </OrderClientAccordion>
  );
}
