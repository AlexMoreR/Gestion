import { WhatsAppIcon } from "@/components/store/whatsapp-icon";

type ProductStickyBuyBarProps = {
  whatsAppHref: string;
  priceText: string;
  code: string | null;
  displayName: string;
};

// Barra fija de compra en el celular (solo en la ficha). Mientras esta en la pagina, la
// burbuja flotante generica de WhatsApp se oculta (ver globals.css, [data-product-buy-bar]).
export function ProductStickyBuyBar({ whatsAppHref, priceText, code, displayName }: ProductStickyBuyBarProps) {
  const subtitle = [code?.trim(), displayName].filter(Boolean).join(" · ");
  return (
    <div
      data-product-buy-bar=""
      role="region"
      aria-label="Comprar este producto"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-[var(--line)] bg-background/95 px-4 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md lg:hidden print:hidden"
    >
      <div className="min-w-0 shrink leading-tight">
        <p className="text-lg font-extrabold tracking-tight text-foreground">{priceText}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <a
        href={whatsAppHref}
        target="_blank"
        rel="noopener noreferrer"
        data-cta="barra"
        className="inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#25D366] px-3 text-[15px] font-extrabold text-[#0b3d22] shadow-[0_10px_24px_-12px_rgba(37,211,102,0.8)] transition hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3d22] active:scale-[0.985]"
      >
        <WhatsAppIcon className="h-5 w-5 shrink-0 fill-current" />
        Comprar por WhatsApp
      </a>
    </div>
  );
}
