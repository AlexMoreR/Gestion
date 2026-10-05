import Link from "next/link";
import { imageVariantUrl } from "@/lib/image-variants";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  cover: string;
};

type CategoriesCarouselProps = {
  categories: CategoryItem[];
  // Cuantas se cargan de una vez (las que se ven al abrir); el resto, al bajar.
  eagerCount?: number;
};

// En inicio las categorias se muestran todas en cuadricula (sin carrusel).
export function CategoriesCarousel({ categories, eagerCount = 0 }: CategoriesCarouselProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {categories.map((item, index) => (
        <Link
          key={item.id}
          href={`/${item.slug}`}
          className="group block transition hover:-translate-y-0.5"
        >
          <div className="aspect-square overflow-hidden rounded-xl">
            <img
              src={imageVariantUrl(item.cover, "thumb")}
              alt={item.name}
              loading={index < eagerCount ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          </div>
          <p className="mt-1.5 break-words text-center text-[11px] font-semibold leading-tight text-foreground sm:text-xs">
            {item.name}
          </p>
        </Link>
      ))}
    </div>
  );
}
