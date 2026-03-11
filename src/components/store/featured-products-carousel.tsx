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
              <div className="relative grid min-h-[10rem] grid-cols-[0.78fr_1.22fr] gap-2 p-3 md:min-h-[12.5rem] md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-0 md:p-5">
                <div className="space-y-2 pr-2 md:pr-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/58">Destacado</p>
                  <p className="line-clamp-2 max-w-[7rem] text-[1.05rem] font-semibold leading-[0.98] text-white md:max-w-[16rem] md:text-[2rem] md:leading-[0.95]">
                    {product.name}
                  </p>
                  <p className="text-sm font-semibold text-white/92 md:text-base">{product.priceLabel}</p>
                </div>
                <div className="relative flex items-center justify-end">
                  <div className="absolute h-20 w-20 rounded-full bg-white/14 blur-3xl md:h-40 md:w-40" />
                  <div className="absolute bottom-2 h-8 w-24 rounded-full bg-black/30 blur-xl md:h-10 md:w-40" />
                  <img
                    src={product.thumbnailUrl}
                    alt={product.name}
                    className="relative z-10 h-28 w-full rounded-2xl object-contain drop-shadow-[0_18px_24px_rgba(15,23,42,0.34)] transition duration-500 group-hover:scale-[1.04] md:h-44 md:max-w-[16rem] md:drop-shadow-[0_22px_28px_rgba(15,23,42,0.34)]"
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {products.length > 1 ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between px-1 md:px-2">
            <button
              type="button"
              onClick={goPrev}
              className="pointer-events-auto inline-flex h-7 w-7 -translate-x-2 items-center justify-center rounded-full border border-white/14 bg-black/26 text-white/88 backdrop-blur-md transition hover:bg-black/34 md:h-9 md:w-9 md:-translate-x-4"
              aria-label="Producto destacado anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="pointer-events-auto inline-flex h-7 w-7 translate-x-2 items-center justify-center rounded-full border border-white/14 bg-black/26 text-white/88 backdrop-blur-md transition hover:bg-black/34 md:h-9 md:w-9 md:translate-x-4"
              aria-label="Siguiente producto destacado"
            >
              <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </button>
          </div>

          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 md:bottom-3 md:gap-2">
            {products.map((product, index) => (
              <button
                key={product.id}
                type="button"
                onClick={() => goTo(index)}
                className={`h-2 rounded-full transition-all ${
                  index === activeIndex ? "w-5 bg-white md:w-6" : "w-1.5 bg-white/40 hover:bg-white/60 md:w-2"
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
