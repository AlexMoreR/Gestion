import type { ProductFaqItem } from "@/lib/product-landing";

// Preguntas frecuentes con <details> nativo (sin JS).
export function ProductFaq({ items }: { items: ProductFaqItem[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <details
          key={item.question}
          className="group rounded-2xl border border-[var(--line)] bg-card text-card-foreground"
        >
          <summary className="relative cursor-pointer list-none rounded-2xl py-4 pl-4 pr-11 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] [&::-webkit-details-marker]:hidden">
            {item.question}
            <span
              aria-hidden="true"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-medium text-muted-foreground group-open:hidden"
            >
              +
            </span>
            <span
              aria-hidden="true"
              className="absolute right-4 top-1/2 hidden -translate-y-1/2 text-xl font-medium text-muted-foreground group-open:inline"
            >
              –
            </span>
          </summary>
          <p className="px-4 pb-4 text-[15px] leading-6 text-muted-foreground">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
