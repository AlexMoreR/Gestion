import Link from "next/link";
import { ArrowUpRight, Edit3, MessageCircle } from "lucide-react";
import { CarrierMessageButton } from "@/components/admin/carrier-message-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
};

function SinDato() {
  return <span className="text-amber-700 dark:text-amber-400">Sin dato</span>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{children}</p>;
}

// Franja de la ficha de la orden: a quién llamar, a dónde va y de qué cotización salió.
export function OrderClientCard({ name, phone, instagram, delivery, quote, canEditQuote }: OrderClientCardProps) {
  const whatsApp = whatsAppDigits(phone);
  const instagramHandle = instagram?.trim().replace(/^@+/, "");

  return (
    <Card className="border-border bg-card/95">
      <CardContent className="grid gap-4 text-sm md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
        <div className="min-w-0 space-y-1 md:pr-4">
          <Heading>Cliente</Heading>
          <p className="break-words font-medium text-foreground">{name?.trim() || <SinDato />}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground">{phone?.trim() || <SinDato />}</span>
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
          </div>
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
              <div className="pt-1">
                <CarrierMessageButton
                  message={delivery.copyText}
                  disabled={!delivery.copyText}
                  label="Copiar datos de envío"
                  copiedMessage="Datos de envío copiados"
                />
              </div>
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
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/cotizaciones/${quote.shareToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ArrowUpRight /> Ver cotización
                </Link>
                {canEditQuote ? (
                  <Link
                    href={`/admin/cotizaciones/${quote.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Edit3 /> Editar
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <p>
              <SinDato />
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
