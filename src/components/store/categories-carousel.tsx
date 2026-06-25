"use client";

import Link from "next/link";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  cover: string;
};

type CategoriesCarouselProps = {
  categories: CategoryItem[];
};

export function CategoriesCarousel({ categories }: CategoriesCarouselProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <Carousel
      opts={{ align: "start", dragFree: true, containScroll: "trimSnaps" }}
      className="w-full"
    >
      <CarouselContent className="-ml-2.5">
        {categories.map((item) => (
          <CarouselItem
            key={item.id}
            className="basis-1/3 pl-2.5 sm:basis-1/4 md:basis-1/6 lg:basis-[12.5%]"
          >
            <Link
              href={`/${item.slug}`}
              className="group block transition hover:-translate-y-0.5"
            >
              <div className="aspect-square overflow-hidden rounded-xl">
                <img
                  src={item.cover}
                  alt={item.name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <p className="mt-1.5 break-words text-center text-[11px] font-semibold leading-tight text-foreground sm:text-xs">
                {item.name}
              </p>
            </Link>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-0 hidden -translate-x-1/2 md:flex" />
      <CarouselNext className="right-0 hidden translate-x-1/2 md:flex" />
    </Carousel>
  );
}
