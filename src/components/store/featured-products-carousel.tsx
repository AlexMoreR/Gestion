"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

type FeaturedProductItem = {
  id: string;
  name: string;
  thumbnailUrl: string;
  priceLabel: string;
};

type FeaturedProductsCarouselProps = {
  products: FeaturedProductItem[];
};

export function FeaturedProductsCarousel({ products }: FeaturedProductsCarouselProps) {
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (products.length < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % products.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [products.length]);

  if (products.length === 0) {
    return null;
  }

  const goTo = (index: number) => {
    setActiveIndex(index);
  };

  const goPrev = () => {
    setActiveIndex((current) => (current - 1 + products.length) % products.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % products.length);
  };

  return (
    <div className="relative min-w-0">
      <div className="overflow-hidden rounded-[30px]">
        <div
          className="flex w-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/productos/${product.id}`}
              className="group relative block w-full shrink-0 basis-full overflow-hidden rounded-[30px] border border-white/14 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] shadow-[0_28px_60px_-38px_rgba(15,23,42,0.8)] backdrop-blur-sm transition hover:border-white/22"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_32%),linear-gradient(180deg,transparent,rgba(14,4,30,0.18))]" />
              <div className="relative grid min-h-[12.5rem] gap-3 p-4 md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-0 md:p-5">
                <div className="space-y-3 md:pr-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/58">Destacado</p>
                  <p className="line-clamp-3 max-w-[16rem] text-xl font-semibold leading-[0.95] text-white md:text-[2rem]">
                    {product.name}
                  </p>
                  <p className="text-base font-semibold text-white/92">{product.priceLabel}</p>
                </div>
                <div className="relative flex items-center justify-center md:justify-end">
                  <div className="absolute h-28 w-28 rounded-full bg-white/14 blur-3xl md:h-40 md:w-40" />
                  <div className="absolute bottom-2 h-10 w-32 rounded-full bg-black/30 blur-xl md:w-40" />
                  <img
                    src={product.thumbnailUrl}
                    alt={product.name}
                    className="relative z-10 h-36 w-full object-contain drop-shadow-[0_22px_28px_rgba(15,23,42,0.34)] transition duration-500 group-hover:scale-[1.04] md:h-44 md:max-w-[16rem]"
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {products.length > 1 ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between px-3">
            <button
              type="button"
              onClick={goPrev}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-black/20 text-white/88 backdrop-blur-md transition hover:bg-black/28"
              aria-label="Producto destacado anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-black/20 text-white/88 backdrop-blur-md transition hover:bg-black/28"
              aria-label="Siguiente producto destacado"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
            {products.map((product, index) => (
              <button
                key={product.id}
                type="button"
                onClick={() => goTo(index)}
                className={`h-2 rounded-full transition-all ${
                  index === activeIndex ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/60"
                }`}
                aria-label={`Ir al destacado ${index + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
