"use client";

import { useEffect, useMemo, useState } from "react";

import { getPublicAssetUrl } from "@/lib/site";
import { GuaranteeBadge } from "@/components/store/guarantee-badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "../ui/button";

type ProductGalleryProps = {
  name: string;
  images: string[];
};

export function ProductGallery({ name, images }: ProductGalleryProps) {
  const gallery = useMemo(
    () =>
      Array.from(
        new Set(
          images
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => getPublicAssetUrl(value)),
        ),
      ),
    [images],
  );

  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }
    setActiveIndex(api.selectedScrollSnap());
    const onSelect = () => setActiveIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (gallery.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
        <div className="grid h-[280px] place-items-center text-sm text-slate-500 md:h-[460px]">
          Sin imagen disponible
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
      <GuaranteeBadge className="pointer-events-none absolute right-3 top-3 z-20 h-16 w-16 text-slate-900 drop-shadow-sm md:h-20 md:w-20" />
      <Carousel setApi={setApi} opts={{ loop: gallery.length > 1 }} className="relative">
        <CarouselContent className="ml-0">
          {gallery.map((url, index) => (
            <CarouselItem key={`${url}-${index}`} className="pl-0">
              <img
                src={url}
                alt={`${name} imagen ${index + 1}`}
                className="h-[280px] w-full bg-white object-contain md:h-[460px]"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        {gallery.length > 1 ? (
          <>
            <CarouselPrevious className="left-3" />
            <CarouselNext className="right-3" />
          </>
        ) : null}
      </Carousel>

      {gallery.length > 1 ? (
        <div className="space-y-2 border-t border-[var(--line)] p-3">
          <p className="text-xs font-medium text-slate-500">
            Galeria ({gallery.length} imagenes)
          </p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-7">
            {gallery.map((url, index) => {
              const active = index === activeIndex;
              return (
                <Button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={() => api?.scrollTo(index)}
                  className={`relative aspect-square overflow-hidden rounded-md border bg-white p-0 transition ${
                    active
                      ? "border-violet-700 ring-2 ring-violet-300/60"
                      : "border-[var(--line)] hover:border-violet-300"
                  }`}
                  aria-label={`Ver imagen ${index + 1}`}
                >
                  <img src={url} alt={`${name} imagen ${index + 1}`} className="h-full w-full object-cover" />
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
