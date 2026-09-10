import Link from "next/link";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  cover: string;
};

type CategoriesCarouselProps = {
  categories: CategoryItem[];
};

// En inicio las categorias se muestran todas en cuadricula (sin carrusel).
export function CategoriesCarousel({ categories }: CategoriesCarouselProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {categories.map((item) => (
        <Link
          key={item.id}
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
      ))}
    </div>
  );
}
