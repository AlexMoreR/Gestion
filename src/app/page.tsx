import { auth } from "@/auth";
import Link from "next/link";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const session = await auth();
  const role = session?.user?.role;
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const categoryFilter = typeof params.category === "string" ? params.category.trim() : "";
  const whereClause = {
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { code: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
            { category: { is: { name: { contains: query, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
    ...(categoryFilter
      ? categoryFilter === "__none__"
        ? { categoryId: null }
        : { categoryId: categoryFilter }
      : {}),
  };
  const products = await prisma.product.findMany({
    where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      images: {
        orderBy: { order: "asc" },
      },
    },
  });
  const systemCurrency = await getSystemCurrency();
  const featuredProduct = products[0] ?? null;
  const promoItems = [
    "Combos especiales de temporada",
    "Envio gratis en productos seleccionados",
    "Problemas para comprar? Te ayudamos por WhatsApp",
    "Descuentos por compras al mayor",
    "Instalacion y asesoria para tu salon",
  ];
  const categoriesCarousel = Array.from(
    products.reduce(
      (acc, product) => {
        if (!product.categoryId || !product.category) {
          return acc;
        }

        const name = product.category.name;
        const categoryId = product.categoryId;
        const categoryLogo = product.category?.logoUrl ?? null;
        const current = acc.get(categoryId);
        if (current) {
          current.count += 1;
          if (!current.usesLogo && categoryLogo) {
            current.cover = categoryLogo;
            current.usesLogo = true;
          }
          return acc;
        }

        acc.set(categoryId, {
          id: categoryId,
          name,
          count: 1,
          cover: categoryLogo || product.thumbnailUrl || "/file.svg",
          usesLogo: Boolean(categoryLogo),
        });
        return acc;
      },
      new Map<string, { id: string; name: string; count: number; cover: string; usesLogo: boolean }>(),
    ).values(),
  );

  return (
    <section className="app-page space-y-6">
      {!query ? (
        <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
          <Card className="relative overflow-hidden rounded-none border-0 p-0 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.65)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,#a78bfa4d,transparent_40%),radial-gradient(circle_at_84%_18%,#7c3aed40,transparent_36%),linear-gradient(135deg,#1f1235_0%,#26184a_45%,#13092b_100%)]" />
            <div className="mx-auto max-w-6xl px-4 md:px-6">
              <div className="relative grid gap-4 py-4 text-white md:grid-cols-[1.1fr_1fr] md:py-5">
                <div className="space-y-4">
                  <h1 className="max-w-2xl text-2xl font-semibold tracking-tight md:text-4xl">
                    Muebles de peluqueria con diseno que transforma tu salon
                  </h1>
                  <p className="max-w-xl text-sm text-slate-200 md:text-base">
                    Sillas, estaciones y mobiliario profesional con presencia premium para clientes exigentes.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                    <span className="rounded-full border border-white/20 px-2.5 py-1">
                      {products.length} productos publicados
                    </span>
                    {role ? <span className="rounded-full border border-white/20 px-2.5 py-1">Sesion {role}</span> : null}
                  </div>
                </div>

                <div className="grid gap-2.5">
                  {featuredProduct ? (
                    <Link
                      href={`/productos/${featuredProduct.id}`}
                      className="group relative block overflow-hidden rounded-2xl border border-white/15 bg-black/20"
                    >
                      <img
                        src={featuredProduct.thumbnailUrl}
                        alt={featuredProduct.name}
                        className="h-36 w-full object-cover transition duration-500 group-hover:scale-[1.04] md:h-44"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-3 pt-10">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-white/80">Destacado</p>
                        <p className="line-clamp-1 text-base font-semibold text-white">{featuredProduct.name}</p>
                        <p className="text-sm font-medium text-violet-200">
                          {formatMoney(String(featuredProduct.price), systemCurrency)}
                        </p>
                      </div>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
      {!query ? (
        <Card className="overflow-hidden border-violet-200/70 bg-gradient-to-r from-violet-50 via-white to-violet-50 p-0">
          <div className="promo-marquee-track">
            {[...promoItems, ...promoItems].map((item, index) => (
              <div
                key={`${item}-${index}`}
                className="inline-flex h-11 items-center gap-2 border-r border-violet-200/70 px-4 text-xs font-semibold text-violet-900 md:h-12 md:px-5 md:text-sm"
              >
                <span className="text-violet-500">•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      <div className="flex snap-x gap-2.5 overflow-x-auto pb-0.5">
        {categoriesCarousel.map((category) => (
          <Link
            key={category.id}
            href={`/?category=${encodeURIComponent(category.id)}`}
            className="group block w-24 shrink-0 snap-start transition hover:-translate-y-0.5 sm:w-28"
          >
            <div className="aspect-square overflow-hidden rounded-xl">
              <img
                src={category.cover}
                alt={category.name}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
            </div>
            <p className="mt-1.5 break-words text-center text-[11px] font-semibold leading-tight text-slate-900 sm:text-xs">
              {category.name}
            </p>
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No hay productos publicados todavia.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Catalogo de tienda</h2>
              <p className="text-xs text-slate-500">Haz clic en un producto para ver su informacion completa.</p>
            </div>
          </div>
          {query || categoryFilter ? (
            <p className="text-xs text-slate-500">
              Resultado{query ? <> para <span className="font-medium text-slate-700">"{query}"</span></> : null}
              {categoryFilter ? " en categoria seleccionada" : ""}: {products.length} producto(s)
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const retailPrice = Number(product.price);
            const whatsAppHref = `https://wa.me/?text=${encodeURIComponent(
              `Hola Inovacciones Magi, quiero comprar el producto: ${product.name}`,
            )}`;

            return (
              <Card key={product.id} className="flex h-full flex-col overflow-hidden rounded-xl p-0 transition duration-300 hover:translate-y-[-3px] hover:shadow-[0_22px_40px_-30px_rgba(15,23,42,0.55)]">
                <Link href={`/productos/${product.id}`} className="group flex flex-1 flex-col">
                  <div className="relative">
                    <img
                      src={product.thumbnailUrl}
                      alt={product.name}
                      className="h-52 w-full bg-white object-contain p-2 transition duration-500 group-hover:scale-[1.02]"
                    />
                    <span className="absolute right-2 top-2 rounded-full border border-white/20 bg-slate-900/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {product.code?.trim() || "SKU"}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col space-y-1.5 px-3 pb-1 pt-2.5">
                    <p className="line-clamp-1 text-xs font-medium text-slate-500">
                      {product.category?.name ?? "Sin categoria"}
                    </p>
                    <h2 className="min-h-[2rem] text-[13px] font-semibold leading-4 normal-case tracking-normal text-slate-900">{product.name}</h2>
                    <div className="space-y-0.5 pt-0">
                      <p className="text-base font-semibold text-violet-800">
                        {formatMoney(String(retailPrice), systemCurrency)}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="grid grid-cols-1 gap-1.5 px-3 pb-3 pt-0.5">
                  <Link
                    href={whatsAppHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/40 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Comprar por WhatsApp
                  </Link>
                  <Link
                    href={`/productos/${product.id}`}
                    className="cta-float cta-float-delay inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-violet-800 px-2.5 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-violet-900 hover:shadow-[0_10px_18px_-12px_rgba(91,33,182,0.95)] active:translate-y-0 active:scale-[0.98]"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Comprar
                  </Link>
                </div>
              </Card>
            );
          })}
          </div>
        </div>
      )}
    </section>
  );
}
