import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getNetmagiStats } from "@/lib/netmagi-stats.server";
import { prisma } from "@/lib/prisma";
import { buildProductPath } from "@/lib/product-slugs";
import { getSystemCurrency } from "@/lib/system-settings";
import type { SaleProfit } from "@/modules/balances/domain/entities";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { bogotaRange, type ChannelSale, marketplaceSales, resolveRangeDays } from "@/modules/marketplace/domain/marketplace-stats";
import type { ProductLink } from "@/modules/marketplace/presentation/marketplace-ads";
import { MarketplaceDashboard } from "@/modules/marketplace/presentation/marketplace-dashboard";

// Estadisticas de NETMAGI (CRM de Facebook Marketplace) sin entrar a la extension. Solo dueno/admin.
// NETMAGI manda solo agregados (ver src/lib/netmagi-stats.server.ts). La fila "Ventas del canal" sale de
// Gestion: ventas pagadas por completo (criterio de Balances) con origen MARKETPLACE (linea Ventas 2).

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function listRecognizedSales(period: { from: Date; to: Date }): Promise<SaleProfit[]> {
  const balances = createPrismaBalancesRepository();
  const rows: SaleProfit[] = [];
  for (let page = 1; ; page += 1) {
    const result = await balances.listProfitReport({ page, pageSize: 500, period });
    rows.push(...result.items);
    if (page >= result.pageCount) break;
  }
  return rows;
}

async function listChannelSales(period: { from: Date; to: Date }): Promise<ChannelSale[]> {
  const recognized = await listRecognizedSales(period);
  if (recognized.length === 0) return [];
  const origins = await prisma.sale.findMany({
    where: { id: { in: recognized.map((row) => row.saleId) } },
    select: { id: true, origin: true },
  });
  const originById = new Map(origins.map((row) => [row.id, row.origin]));
  return recognized.map((row) => ({
    recognizedAt: row.createdAt,
    amount: row.saleAmount,
    profit: row.netProfit,
    origin: originById.get(row.saleId) ?? null,
  }));
}

// Ficha en magilus.com de cada codigo de producto que aparece en la tabla de anuncios. Si falla, la tabla
// se ve igual, solo que sin enlace a la ficha.
async function loadProductLinks(codes: string[]): Promise<Record<string, ProductLink>> {
  if (codes.length === 0) return {};
  try {
    const products = await prisma.product.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, slug: true, name: true, category: { select: { slug: true } } },
    });
    return Object.fromEntries(products.map((product) => [product.code, { name: product.name, path: buildProductPath(product) }]));
  } catch {
    return {};
  }
}

export default async function AdminMarketplacePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    redirect("/unauthorized");
  }
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "marketplace");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const days = resolveRangeDays(params.dias);
  const tableRange = bogotaRange(days); // ventana inicial de los filtros de la tabla de anuncios
  // Siempre se piden al menos 30 dias: el grafico y las comparaciones con ayer y con el promedio de 7 dias los necesitan.
  const range = bogotaRange(Math.max(days, 30));
  const now = new Date();

  // NETMAGI va primero y en serie (ver netmagi-stats.server.ts); las ventas de Gestion, en paralelo.
  const [stats, sales, currency] = await Promise.all([
    getNetmagiStats(range),
    listChannelSales({ from: range.from, to: range.to }).catch(() => null),
    getSystemCurrency(),
  ]);
  const channel = sales ? marketplaceSales(sales, range, stats.resumen?.totales.clientes_nuevos ?? 0) : null;
  const codes = [...new Set((stats.anuncios?.anuncios ?? []).map((ad) => ad.codigo).filter((code): code is string => !!code))];
  const productLinks = await loadProductLinks(codes);

  return (
    <MarketplaceDashboard
      days={days}
      desde={tableRange.desde}
      hasta={tableRange.hasta}
      fetchDesde={range.desde}
      now={now.toISOString()}
      productLinks={productLinks}
      stats={stats}
      channel={channel}
      currency={currency}
    />
  );
}
