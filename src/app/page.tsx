	import Link from "next/link";
	import { MessageCircle, ShoppingCart, Star, Truck, Shield } from "lucide-react";
	import { FeaturedProductsCarousel } from "@/components/store/featured-products-carousel";
	import { Card } from "@/components/ui/card";
	import { formatMoney } from "@/lib/currency";
	import { prisma } from "@/lib/prisma";
	import { getSystemCurrency } from "@/lib/system-settings";

	type PageProps = {
	  searchParams: Promise<Record<string, string | string[] | undefined>>;
	};

	export default async function HomePage({ searchParams }: PageProps) {
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
	  const featuredProducts = products.slice(0, 5).map((product) => ({
		id: product.id,
		name: product.name,
		thumbnailUrl: product.thumbnailUrl,
		priceLabel: formatMoney(String(product.price), systemCurrency),
	  }));

	  // Texto ajustado para Magilus
	  const promoItems = [
		"Combos especiales de temporada",
		"Envío gratis en productos seleccionados",
		"¿Problemas para comprar? Te ayudamos por WhatsApp",
		"Descuentos por compras al mayor",
		"Instalación y asesoría para tu salón",
	  ];

	  // Nombre actualizado a Magilus
	  const heroQuoteHref = "https://wa.me/573046481994?text=Hola%20Magilus%2C%20quiero%20cotizar";

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
		<section className="app-page space-y-4">
		  {!query ? (
			<div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
			  <Card className="relative overflow-hidden rounded-none border-0 p-0 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.65)]">
				<div
				  className="absolute inset-0"
				  style={{
					backgroundImage: "linear-gradient(135deg, var(--primary-strong) 0%, var(--primary) 55%, var(--primary-strong) 100%)",
				  }}
				/>
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_30%),radial-gradient(circle_at_75%_18%,rgba(255,255,255,0.12),transparent_18%),linear-gradient(180deg,transparent,rgba(20,5,44,0.18))]" />
				<div className="mx-auto max-w-6xl px-4 md:px-6">
				  <div className="relative py-3 text-white md:py-4">
					<div className="grid items-center gap-4 md:grid-cols-[minmax(0,1.02fr)_minmax(300px,0.98fr)] md:gap-6">
					  <div className="space-y-3.5 text-left md:space-y-4">
					  {/* Hero principal */}
					  <h1 className="w-full max-w-none text-[1.45rem] font-semibold leading-[0.96] tracking-tight md:max-w-xl md:text-[3rem] md:leading-[0.94]">
						Remodela tu salón con el estilo que mereces.
					  </h1>
					  <p className="w-full max-w-[18.5rem] text-[13px] leading-5 text-white/82 md:max-w-lg md:text-base md:leading-6">
						Sillas, estaciones y mobiliario profesional con presencia premium para clientes exigentes.
					  </p>
					  {/* Botones del hero */}
					  <div className="hidden flex-wrap items-center gap-2 pt-0.5 text-xs text-slate-200 md:flex">
						<Link
						  href={heroQuoteHref}
						  target="_blank"
						  rel="noopener noreferrer"
						  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/14 bg-black/18 px-3.5 text-[13px] font-semibold text-white backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/22 hover:bg-black/24 active:translate-y-0 md:h-10 md:px-4.5"
						>
						  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white/10 md:h-5 md:w-5">
							<MessageCircle className="h-3.5 w-3.5" />
						  </span>
						  Cotizar ahora
						</Link>
						<Link
						  href="#catalogo"
						  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))] px-3.5 text-[13px] font-semibold text-white/92 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.2),rgba(255,255,255,0.08))] active:translate-y-0 md:h-10 md:px-4.5"
						>
						  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white/12 bg-white/8 md:h-5 md:w-5">
							<ShoppingCart className="h-3.5 w-3.5" />
						  </span>
						  Ver catálogo
						</Link>
					  </div>
					</div>

					<div className="grid min-w-0 gap-2.5">
					  <FeaturedProductsCarousel products={featuredProducts} />
					  <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5 text-xs text-slate-200 md:hidden">
						<Link
						  href={heroQuoteHref}
						  target="_blank"
						  rel="noopener noreferrer"
						  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/14 bg-black/18 px-3.5 text-[13px] font-semibold text-white backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/22 hover:bg-black/24 active:translate-y-0"
						>
						  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white/10">
							<MessageCircle className="h-3.5 w-3.5" />
						  </span>
						  Cotizar ahora
						</Link>
						<Link
						  href="#catalogo"
						  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))] px-3.5 text-[13px] font-semibold text-white/92 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.2),rgba(255,255,255,0.08))] active:translate-y-0"
						>
						  <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white/12 bg-white/8">
							<ShoppingCart className="h-3.5 w-3.5" />
						  </span>
                          Ver catalogo
						</Link>
					  </div>
					</div>
				  </div>
				</div>
			  </div>
			  </Card>
			</div>
		  ) : null}

		  {/* Marquee promocional */}
		  {!query ? (
			<div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
			  <div
				className="overflow-hidden rounded-none border-0"
				style={{
				  backgroundImage: "linear-gradient(90deg, var(--primary-strong) 0%, var(--primary) 50%, var(--primary-strong) 100%)",
				}}
			  >
				<div className="promo-marquee-track">
				  {[...promoItems, ...promoItems].map((item, index) => (
					<div
					  key={`${item}-${index}`}
					  className="inline-flex h-9 items-center gap-2 border-r border-white/20 px-3 text-[11px] font-semibold text-white md:h-10 md:px-4 md:text-xs"
					>
					  <span className="text-amber-300">★</span>
					  <span>{item}</span>
					</div>
				  ))}
				</div>
			  </div>
			</div>
		  ) : null}

		  {/* Sección de confianza */}
		  {!query ? (
			<div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen bg-slate-50 py-6">
			  <div className="mx-auto max-w-6xl px-4 md:px-6">
				<div className="grid grid-cols-3 gap-4 text-center md:grid-cols-3">
				  <div className="flex flex-col items-center gap-1.5">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
					  <Star className="h-5 w-5 text-[var(--primary-strong)]" />
					</div>
					<p className="text-lg font-bold text-slate-900">500+</p>
					<p className="text-xs text-slate-500">Salones equipados</p>
				  </div>
				  <div className="flex flex-col items-center gap-1.5">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
					  <Truck className="h-5 w-5 text-[var(--primary-strong)]" />
					</div>
					<p className="text-lg font-bold text-slate-900">Todo Colombia</p>
					<p className="text-xs text-slate-500">Envío a tu ciudad</p>
				  </div>
				  <div className="flex flex-col items-center gap-1.5">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
					  <Shield className="h-5 w-5 text-[var(--primary-strong)]" />
					</div>
					<p className="text-lg font-bold text-slate-900">Garantía</p>
					<p className="text-xs text-slate-500">Respaldo post-venta</p>
				  </div>
				</div>
			  </div>
			</div>
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
			  <p className="text-sm text-slate-600">No hay productos publicados todavía.</p>
			</Card>
		  ) : (
			// id="catalogo" para el scroll del botón "Ver catálogo"
			<div className="space-y-3" id="catalogo">
			  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
				  <h2 className="text-xl font-semibold tracking-tight text-slate-900">Catálogo de tienda</h2>
				</div>
			  </div>
			  {query || categoryFilter ? (
				<p className="text-xs text-slate-500">
				  Resultado{query ? <> para <span className="font-medium text-slate-700">"{query}"</span></> : null}
				  {categoryFilter ? " en categoría seleccionada" : ""}: {products.length} producto(s)
				</p>
			  ) : null}
			  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
			  {products.map((product) => {
				const retailPrice = Number(product.price);
				// Nombre actualizado a Magilus
				const whatsAppHref = `https://wa.me/573046481994?text=${encodeURIComponent(
				  `Hola Magilus, quiero comprar el producto: ${product.name}`,
				)}`;

				return (
				  <Card key={product.id} className="flex h-full flex-col overflow-hidden rounded-xl p-0 transition duration-300 hover:translate-y-[-3px] hover:shadow-[0_22px_40px_-30px_rgba(15,23,42,0.55)]">
					<Link href={`/productos/${product.id}`} className="group flex flex-1 flex-col">
					  <div className="relative">
						<img
						  src={product.thumbnailUrl}
						  alt={product.name}
						  className="h-52 w-full bg-white object-contain p-2 transition duration-500 group-hover:scale-[1.02]"
						  loading="lazy"
						/>
						<span className="absolute right-2 top-2 rounded-full border border-white/20 bg-slate-900/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
						  {product.code?.trim() || "SKU"}
						</span>
					  </div>
					  <div className="flex flex-1 flex-col space-y-1.5 px-3 pb-1 pt-2.5">
						<p className="line-clamp-1 text-xs font-medium text-slate-500">
						  {product.category?.name ?? "Sin categoría"}
						</p>
						<h2 className="min-h-[2rem] text-[13px] font-semibold leading-4 normal-case tracking-normal text-slate-900">{product.name}</h2>
						<div className="space-y-0.5 pt-0">
						  <p className="text-base font-semibold text-[var(--primary-strong)]">
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
						className="inline-flex items-center justify-center gap-1 py-1 text-xs font-semibold text-emerald-700 transition hover:text-emerald-800"
					  >
						<MessageCircle className="h-4 w-4" />
						Comprar por WhatsApp
					  </Link>
					  <Link
						href={`/productos/${product.id}`}
						className="cta-float cta-float-delay inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--primary-strong)] active:translate-y-0 active:scale-[0.98]"
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
