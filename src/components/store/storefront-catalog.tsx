import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Shield, ShoppingCart, Star, Truck } from "lucide-react";
import { CatalogPagination } from "@/components/store/catalog-pagination";
import { CategoriesCarousel } from "@/components/store/categories-carousel";
import { GuaranteeBadge } from "@/components/store/guarantee-badge";
import { FeaturedProductsCarousel } from "@/components/store/featured-products-carousel";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { buildProductPath } from "@/lib/product-slugs";
import { getPublicAssetUrl, getSiteUrl, siteConfig } from "@/lib/site";
import {
  buildSystemWhatsAppHref,
  getSystemBrandName,
  getSystemCurrency,
  getSystemStorefrontHeroDescription,
  getSystemStorefrontHeroTitle,
  getSystemStorefrontLogoPath,
  getSystemStorefrontPromoItems,
  getSystemWhatsAppPhoneDisplay,
} from "@/lib/system-settings";

type StorefrontCatalogProps = {
  query?: string;
  categorySlug?: string;
  showFullCatalog?: boolean;
  page?: number;
  basePath?: string;
};

const PRODUCTS_PER_PAGE = 24;

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M19.05 4.94A9.9 9.9 0 0 0 12.02 2C6.53 2 2.05 6.47 2.05 11.96c0 1.76.46 3.49 1.34 5.01L2 22l5.17-1.36a9.93 9.93 0 0 0 4.84 1.24h.01c5.49 0 9.96-4.47 9.96-9.96a9.9 9.9 0 0 0-2.93-6.98Zm-7.03 15.25h-.01a8.3 8.3 0 0 1-4.23-1.16l-.3-.18-3.07.81.82-2.99-.2-.31a8.25 8.25 0 0 1-1.28-4.4c0-4.55 3.71-8.26 8.27-8.26 2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.42 5.84c0 4.55-3.71 8.26-8.25 8.26Zm4.53-6.18c-.25-.12-1.48-.73-1.71-.81-.23-.09-.39-.12-.56.12-.17.24-.64.81-.79.98-.15.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.24-.74-.66-1.24-1.47-1.39-1.72-.15-.24-.02-.37.11-.49.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.76-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.24-.87.85-.87 2.07s.89 2.41 1.02 2.57c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.53.59.19 1.12.16 1.54.1.47-.07 1.48-.6 1.69-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

const naturalCodeCollator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

function compareProductsByNaturalCode(
  a: { code: string | null; name: string },
  b: { code: string | null; name: string },
) {
  const leftCode = a.code?.trim() ?? "";
  const rightCode = b.code?.trim() ?? "";

  if (leftCode && rightCode) {
    const codeComparison = naturalCodeCollator.compare(leftCode, rightCode);
    if (codeComparison !== 0) {
      return codeComparison;
    }
  }

  if (leftCode && !rightCode) {
    return -1;
  }

  if (!leftCode && rightCode) {
    return 1;
  }

  return naturalCodeCollator.compare(a.name, b.name);
}

function formatCatalogPrice(value: number | string, currency: Parameters<typeof formatMoney>[1]) {
  return formatMoney(value, currency).replace(/([.,]00)(?!\d)/, "");
}

export async function generateStorefrontMetadata({
  query = "",
  categorySlug,
}: StorefrontCatalogProps): Promise<Metadata> {
  const [brandName, storefrontHeroDescription] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontHeroDescription(),
  ]);
  const normalizedQuery = query.trim();
  const normalizedCategorySlug = categorySlug?.trim() ?? "";
  const category = normalizedCategorySlug
    ? await prisma.category.findUnique({
        where: { slug: normalizedCategorySlug },
        select: {
          name: true,
          slug: true,
          description: true,
          seoTitle: true,
          seoDescription: true,
          _count: {
            select: {
              products: true,
            },
          },
          logoUrl: true,
          products: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              thumbnailUrl: true,
            },
          },
        },
      })
    : null;

  const title = normalizedQuery
    ? `Resultados para ${normalizedQuery}`
    : category
      ? category.seoTitle?.trim() || category.name
      : {
          absolute: `${brandName} | Mobiliario profesional para peluquería, barbería y salón de belleza`,
        };
  const description = normalizedQuery
    ? `Explora en ${brandName} resultados para ${normalizedQuery} en sillas, estaciones y mobiliario profesional para salón y barbería.`
    : category
      ? category.seoDescription?.trim() ||
        category.description?.trim() ||
        `Explora ${category.name.toLowerCase()} en ${brandName}, mobiliario profesional para peluquería, salón de belleza y barbería.`
      : storefrontHeroDescription;
  const canonical = normalizedQuery
    ? getSiteUrl(
        `/?${new URLSearchParams({
          q: normalizedQuery,
        }).toString()}`,
      )
    : category
      ? getSiteUrl(`/${category.slug}`)
      : getSiteUrl("/");
  const socialTitle =
    normalizedQuery || category
      ? `${typeof title === "string" ? title : brandName} | ${brandName}`
      : `${brandName} | Mobiliario profesional para peluquería, barbería y salón de belleza`;
  const socialImagePath =
    category?.logoUrl?.trim() || category?.products[0]?.thumbnailUrl?.trim() || siteConfig.ogImagePath;
  const socialImage = socialImagePath.startsWith("http") ? socialImagePath : getSiteUrl(socialImagePath);
  const socialImageAlt = category ? `${category.name} | ${brandName}` : brandName;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: socialTitle,
      description,
      url: canonical,
      images: [
        {
          url: socialImage,
          alt: socialImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [socialImage],
    },
    ...(category && category._count.products === 0
      ? {
          robots: {
            index: false,
            follow: true,
          },
        }
      : {}),
  };
}

export async function StorefrontCatalog({
  query = "",
  categorySlug,
  showFullCatalog = false,
  page = 1,
  basePath = "/",
}: StorefrontCatalogProps) {
  const normalizedQuery = query.trim();
  const normalizedCategorySlug = categorySlug?.trim() ?? "";
  const [
    category,
    categoryNavItems,
    systemCurrency,
    totalProducts,
    totalCategories,
    brandName,
    whatsAppPhoneDisplay,
    storefrontLogoPath,
    storefrontHeroTitle,
    storefrontHeroDescription,
    storefrontPromoItems,
  ] = await Promise.all([
    normalizedCategorySlug
      ? prisma.category.findUnique({
          where: { slug: normalizedCategorySlug },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
        },
      })
      : Promise.resolve(null),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        products: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            thumbnailUrl: true,
          },
        },
      },
    }),
    getSystemCurrency(),
    prisma.product.count(),
    prisma.category.count({ where: { isActive: true } }),
    getSystemBrandName(),
    getSystemWhatsAppPhoneDisplay(),
    getSystemStorefrontLogoPath(),
    getSystemStorefrontHeroTitle(),
    getSystemStorefrontHeroDescription(),
    getSystemStorefrontPromoItems(),
  ]);

  // El grid completo (pesado) solo se renderiza en búsquedas, categorías o la página /catalogo.
  // En el inicio basta con los destacados, evitando traer todo el catálogo y mejorando la carga.
  const showCatalogGrid = Boolean(category || normalizedQuery || showFullCatalog);

  const productsResult = await prisma.product.findMany({
    where: {
      ...(normalizedQuery
        ? {
            OR: [
              { name: { contains: normalizedQuery, mode: "insensitive" as const } },
              { code: { contains: normalizedQuery, mode: "insensitive" as const } },
              { description: { contains: normalizedQuery, mode: "insensitive" as const } },
              { category: { is: { name: { contains: normalizedQuery, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
      ...(category ? { categoryId: category.id } : {}),
    },
    orderBy: { createdAt: "desc" },
    ...(showCatalogGrid ? {} : { take: 5 }),
    include: {
      category: true,
      images: {
        orderBy: { order: "asc" },
      },
    },
  });

  const products =
    category && !normalizedQuery
      ? [...productsResult].sort((left, right) => compareProductsByNaturalCode(left, right))
      : productsResult;

  const featuredProducts = products.slice(0, 5).map((product) => ({
    id: product.id,
    href: buildProductPath(product),
    name: product.name,
    thumbnailUrl: getPublicAssetUrl(product.thumbnailUrl),
    priceLabel: formatCatalogPrice(String(product.price), systemCurrency),
  }));

  // Paginado del catálogo: solo se renderiza y procesa la página visible.
  const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedProducts = showCatalogGrid
    ? products.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE)
    : products;

  const promoItems = storefrontPromoItems;

  const categoriesCarousel = categoryNavItems.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    cover: getPublicAssetUrl(item.logoUrl || item.products[0]?.thumbnailUrl || "/file.svg"),
  }));

  const pageHeading = category
    ? category.name
    : storefrontHeroTitle;
  const pageIntro = category
    ? category.description?.trim() ||
      `Explora ${category.name.toLowerCase()} en ${brandName}, con referencias para peluquería, salón de belleza y barbería.`
    : storefrontHeroDescription;
  const collectionDescription = category
    ? category.description?.trim() ||
      `${category.name} para negocios que buscan imagen, funcionalidad y experiencia premium en cada servicio.`
    : "Catálogo de sillas, estaciones y mobiliario profesional premium para salón de belleza, barbería y espacios de alto nivel.";
  const baseUrl = category ? `/${category.slug}` : "/";
  const storefrontWhatsAppHref = await buildSystemWhatsAppHref(
    `Hola ${brandName}, quiero cotizar mobiliario profesional`,
  );
  const productWhatsAppHrefById = new Map(
    showCatalogGrid
      ? await Promise.all(
          pagedProducts.map(async (product) => [
            product.id,
            await buildSystemWhatsAppHref(`Hola ${brandName}, quiero comprar el producto: ${product.name}`),
          ] as const),
        )
      : [],
  );

  // Construye el enlace de cada página conservando la categoría y la búsqueda actual.
  const paginationBase = category ? `/${category.slug}` : basePath;
  const buildPageHref = (targetPage: number) => {
    const searchParams = new URLSearchParams();
    if (normalizedQuery) {
      searchParams.set("q", normalizedQuery);
    }
    if (targetPage > 1) {
      searchParams.set("page", String(targetPage));
    }
    const queryString = searchParams.toString();
    return queryString ? `${paginationBase}?${queryString}` : paginationBase;
  };

  const storefrontSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${getSiteUrl("/")}#organization`,
        name: brandName,
        legalName: brandName,
        url: getSiteUrl("/"),
        logo: getSiteUrl(storefrontLogoPath),
        description: `${brandName} ofrece mobiliario profesional para peluquería, barbería y salón de belleza.`,
        telephone: whatsAppPhoneDisplay,
      },
      {
        "@type": "CollectionPage",
        "@id": `${getSiteUrl(baseUrl)}#catalog`,
        url: getSiteUrl(baseUrl),
        name: category ? `${category.name} | ${brandName}` : `Catálogo de ${brandName}`,
        description: collectionDescription,
      },
    ],
  };

  return (
    <section className="app-page space-y-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(storefrontSchema) }}
      />

      {!normalizedQuery && !showFullCatalog ? (
        <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
          <Card className="relative overflow-hidden rounded-none border-0 bg-white p-0 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.18)]">
            <div className="mx-auto max-w-6xl px-4 md:px-6">
              <div className="relative py-3 text-slate-900 md:py-4">
                <div className="grid items-center gap-2.5 md:grid-cols-[minmax(0,1.02fr)_minmax(300px,0.98fr)] md:gap-6">
                  <div className="space-y-2.5 text-center md:space-y-4 md:text-left">
                    <h1 className="mx-auto w-full max-w-none text-[1.18rem] font-semibold leading-[0.98] tracking-tight md:mx-0 md:max-w-xl md:text-[3rem] md:leading-[0.94]">
                      {pageHeading}
                    </h1>
                    <p className="mx-auto w-full max-w-none text-[13px] leading-[1.45] text-slate-600 md:mx-0 md:max-w-lg md:text-base md:leading-6">
                      {pageIntro}
                    </p>
                    {!category ? (
                      <div className="hidden flex-wrap items-center gap-2 pt-0.5 text-xs text-slate-200 md:flex">
                      <Link
                        href={storefrontWhatsAppHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--primary)] px-3.5 text-[13px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--primary-strong)] active:translate-y-0 md:h-10 md:px-4.5"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Cotiza aqui
                      </Link>
                      <Link
                        href="/catalogo"
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3.5 text-[13px] font-semibold text-[var(--primary)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/10 active:translate-y-0 md:h-10 md:px-4.5"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Ver catálogo
                      </Link>
                      </div>
                    ) : null}
                  </div>

                  {!category ? (
                    <div className="grid min-w-0 gap-2 md:gap-2.5">
                    <FeaturedProductsCarousel products={featuredProducts} />
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-0.5 text-xs text-slate-200 md:hidden">
                      <Link
                        href={storefrontWhatsAppHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--primary)] px-3.5 text-[13px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--primary-strong)] active:translate-y-0"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Cotiza aqui
                      </Link>
                      <Link
                        href="/catalogo"
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3.5 text-[13px] font-semibold text-[var(--primary)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/10 active:translate-y-0"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Ver catálogo
                      </Link>
                    </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {!normalizedQuery ? (
        <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
          <div
            className="overflow-hidden rounded-none border-0"
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--primary-strong) 0%, var(--primary) 50%, var(--primary-strong) 100%)",
            }}
          >
            <div className="promo-marquee-track">
              {[...promoItems, ...promoItems].map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className="inline-flex h-9 items-center gap-2 border-r border-white/20 px-3 text-[11px] font-semibold text-white md:h-10 md:px-4 md:text-xs"
                >
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {!category ? (
        <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 px-0.5 text-center">
          <span className="text-sm md:text-base">
            📱
          </span>
          <h2 className="text-sm font-normal tracking-tight text-foreground md:text-lg">
            Busca tu <strong className="font-semibold">categoría</strong>
          </h2>
        </div>
          <CategoriesCarousel categories={categoriesCarousel} />
        </div>
      ) : null}

      {!showCatalogGrid ? null : products.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">No hay productos publicados todavia.</p>
        </Card>
      ) : (
        <div className="space-y-3" id="catalogo">
          {false && !normalizedQuery && !category ? (
            <div className="rounded-2xl border border-[var(--line)] bg-card px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary-strong)]">
                Mobiliario profesional premium
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                Mobiliario profesional para peluquería, barbería y salón de belleza
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                {`En ${brandName} encuentras sillas, estaciones y mobiliario profesional para equipar tu negocio con imagen, funcionalidad y respaldo.`}
              </p>
            </div>
          ) : null}

          {!category ? (
            <div className="flex items-center justify-center gap-2 px-0.5 text-center">
              <span className="text-sm md:text-base">🛍️</span>
              <h2 className="text-sm font-normal tracking-tight text-foreground md:text-lg">
                Catálogo de <strong className="font-semibold">tienda</strong>
              </h2>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {pagedProducts.map((product) => {
              const retailPrice = Number(product.price);
              const comparePrice = retailPrice * 1.25;
              const productHref = buildProductPath(product);
              const whatsAppHref = productWhatsAppHrefById.get(product.id) ?? storefrontWhatsAppHref;

              return (
                <Card
                  key={product.id}
                  className="flex h-full flex-col overflow-hidden rounded-xl p-0 transition duration-300 hover:translate-y-[-3px] hover:shadow-[0_22px_40px_-30px_rgba(15,23,42,0.55)]"
                >
                  <Link href={productHref} className="group flex flex-1 flex-col">
                    <div className="relative">
                      <img
                        src={getPublicAssetUrl(product.thumbnailUrl)}
                        alt={product.name}
                        className="h-40 w-full bg-card object-contain p-2 transition duration-500 group-hover:scale-[1.02] md:h-52"
                        loading="lazy"
                      />
                      <div className="absolute -bottom-1 left-2.5 z-10 rounded-md border border-[color-mix(in_srgb,var(--primary)_24%,white)] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-strong)_100%)] px-1.5 py-1 text-white shadow-[0_12px_20px_-14px_color-mix(in_srgb,var(--primary)_70%,black)]">
                        <span className="flex items-center gap-1 text-[7px] font-black uppercase leading-none tracking-[0.08em]">
                          <Truck className="h-2.5 w-2.5" />
                          Envío
                        </span>
                        <span className="mt-0.5 block text-[9px] font-black uppercase leading-none tracking-[0.08em]">
                          Gratis
                        </span>
                      </div>
                      <span className="absolute left-2 top-2 rounded-full border border-white/20 bg-slate-900/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                        {product.code?.trim() || "SKU"}
                      </span>
                      <GuaranteeBadge className="pointer-events-none absolute right-2 top-2 h-11 w-11 text-slate-900 md:h-12 md:w-12" />
                    </div>

                    <div className="flex flex-1 flex-col space-y-1.5 px-3 pb-1 pt-2.5">
                      <p className="line-clamp-1 text-xs font-medium text-muted-foreground">
                        {product.category?.name ?? "Sin categoría"}
                      </p>
                      <h3 className="min-h-[2rem] text-[13px] font-semibold leading-4 normal-case tracking-normal text-foreground">
                        {product.name}
                      </h3>
                      <div className="flex items-start justify-between gap-2 pt-0">
                        <div className="space-y-0.5">
                          <p className="text-xl font-bold tracking-tight text-foreground">
                            {formatCatalogPrice(String(retailPrice), systemCurrency)}
                          </p>
                          <p className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
                            <span className="line-through text-muted-foreground">
                              {formatCatalogPrice(String(comparePrice), systemCurrency)}
                            </span>
                            <span className="line-through">Antes</span>
                          </p>
                        </div>
                        <p className="text-right text-[9px] font-semibold leading-3 text-muted-foreground">
                          Cualquier
                          <br />
                          medio
                        </p>
                      </div>
                    </div>
                  </Link>

                  <div className="grid grid-cols-1 gap-1.5 px-3 pb-3 pt-0.5">
                    <Link
                      href={whatsAppHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-center text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 active:translate-y-0 active:scale-[0.98]"
                    >
                      Comprar por
                      <WhatsAppIcon className="h-4 w-4" />
                    </Link>
                    <Link
                      href={productHref}
                      className="cta-float cta-float-delay inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--primary-strong)] active:translate-y-0 active:scale-[0.98]"
                    >
                      Comprar
                      <ShoppingCart className="h-4 w-4" />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
          <CatalogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            buildHref={buildPageHref}
          />
          {category ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 px-0.5 text-center">
                <span className="text-sm md:text-base">📱</span>
                <h2 className="text-sm font-normal tracking-tight text-foreground md:text-lg">
                  Busca tu <strong className="font-semibold">categoría</strong>
                </h2>
              </div>
              <CategoriesCarousel categories={categoriesCarousel} />
            </div>
          ) : null}
          {!normalizedQuery && category ? (
            <div className="rounded-2xl border border-[var(--line)] bg-card px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary-strong)]">
                {category.name}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {`${category.name} para peluquería, barbería y espacios de belleza`}
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                {category.description?.trim() ||
                  `Encuentra ${category.name.toLowerCase()} en ${brandName}, con referencias pensadas para negocios que necesitan proyectar calidad, comodidad y una imagen profesional.`}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {!normalizedQuery && !category ? (
        <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen bg-muted py-6">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid grid-cols-3 gap-4 text-center md:grid-cols-3">
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
                  <Star className="h-5 w-5 text-[var(--primary-strong)]" />
                </div>
                <p className="text-lg font-bold text-foreground">500+</p>
                <p className="text-xs text-muted-foreground">Salones equipados</p>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
                  <Truck className="h-5 w-5 text-[var(--primary-strong)]" />
                </div>
                <p className="text-lg font-bold text-foreground">Todo Colombia</p>
                <p className="text-xs text-muted-foreground">Envío a tu ciudad</p>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
                  <Shield className="h-5 w-5 text-[var(--primary-strong)]" />
                </div>
                <p className="text-lg font-bold text-foreground">Garantía</p>
                <p className="text-xs text-muted-foreground">Respaldo postventa</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
