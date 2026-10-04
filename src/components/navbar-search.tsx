"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

// Buscador del encabezado como icono: al tocarlo abre una caja flotante arriba
// (con el fondo difuminado y el teclado abierto). Busca en el catalogo: /?q=...
// Se dibuja en <body> porque el encabezado usa backdrop-blur, que "encierra"
// a los elementos position: fixed dentro de el.
export function NavbarSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const term = query.trim();

  const openSearch = () => {
    // Si ya hay una busqueda en la URL, se precarga para corregirla.
    setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    setOpen(true);
  };

  const close = () => setOpen(false);

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (term.length < 2) return;
    setOpen(false);
    router.push(`/?q=${encodeURIComponent(term)}`);
  };

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    // Evita que la pagina de atras se desplace mientras se busca.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frameId = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        aria-label="Buscar productos"
        title="Buscar productos"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-background/90 text-[var(--primary)] shadow-[0_8px_18px_-14px_rgba(15,23,42,0.45)] transition hover:bg-muted md:h-10 md:w-10"
      >
        <Search className="h-4 w-4" />
      </button>

      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Buscar productos"
              className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm"
              onClick={close}
            >
              <div
                className="mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <form onSubmit={submit} className="flex items-center gap-3 px-4">
                  <Search className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    ref={inputRef}
                    autoFocus
                    type="search"
                    name="q"
                    enterKeyHint="search"
                    autoComplete="off"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar productos, categorías, códigos..."
                    aria-label="Buscar productos"
                    className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        inputRef.current?.focus();
                      }}
                      aria-label="Borrar búsqueda"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </form>

                <div className="border-t border-slate-100">
                  {term.length < 2 ? (
                    <p className="px-4 py-5 text-center text-sm text-slate-500">Escribe al menos dos letras.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => submit()}
                      className="flex w-full items-center gap-3 px-4 py-4 text-left text-sm font-medium text-[var(--primary)] hover:bg-slate-50"
                    >
                      <Search className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">
                        Ver resultados para “{term}”
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
