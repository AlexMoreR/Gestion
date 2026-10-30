import Link from "next/link";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";

// Accesos rápidos a las categorías más buscadas (fijos, los dio el pedido).
const CATEGORY_LINKS = [
  { label: "Camillas", href: "/catalogo?q=camilla" },
  { label: "Tarimas pedicure", href: "/tarimas-pedicure" },
  { label: "Lavacabezas", href: "/catalogo?q=lavacabezas" },
  { label: "Sillas hidráulicas", href: "/catalogo?q=silla%20hidraulica" },
];

// Contenido de la página 404 de la tienda: buscador, categorías y WhatsApp. Sin JavaScript.
export function NotFoundContent({ whatsAppHref }: { whatsAppHref: string }) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-10 text-center md:py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
          Este producto ya no está aquí
        </h1>
        <p className="text-base text-slate-600">
          Puede que el enlace sea viejo. Búscalo en el catálogo o escríbenos por WhatsApp.
        </p>
      </div>

      <form action="/catalogo" method="get" role="search" className="flex w-full gap-2">
        <input
          type="search"
          name="q"
          aria-label="Buscar productos"
          placeholder="¿Qué estás buscando?"
          className="min-h-12 w-full min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        />
        <button
          type="submit"
          className="min-h-12 shrink-0 rounded-xl bg-slate-900 px-5 text-base font-semibold text-white transition hover:bg-slate-800"
        >
          Buscar
        </button>
      </form>

      <nav aria-label="Categorías" className="grid w-full grid-cols-2 gap-3 md:grid-cols-4">
        {CATEGORY_LINKS.map((category) => (
          <Link
            key={category.href}
            href={category.href}
            className="flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {category.label}
          </Link>
        ))}
      </nav>

      <a
        href={whatsAppHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-5 text-[17px] font-extrabold text-[#0b3d22] shadow-[0_10px_24px_-12px_rgba(37,211,102,0.8)] transition hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] active:scale-[0.985] sm:w-auto sm:px-8"
      >
        <WhatsAppIcon className="h-6 w-6 fill-current" />
        Escríbenos por WhatsApp
      </a>
    </section>
  );
}
